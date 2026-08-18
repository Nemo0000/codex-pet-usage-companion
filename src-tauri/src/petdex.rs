use image::{ImageFormat, ImageReader};
use reqwest::{blocking::Client, Url};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::HashSet,
    fs,
    io::{Cursor, Read},
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use crate::codex_pets_directory;

const PETDEX_MANIFEST_URL: &str = "https://petdex.dev/api/manifest";
const PETDEX_ASSET_HOST: &str = "assets.petdex.dev";
const MANIFEST_CACHE_TTL: Duration = Duration::from_secs(15 * 60);
const MAX_MANIFEST_BYTES: usize = 8 * 1024 * 1024;
const MAX_PET_JSON_BYTES: usize = 256 * 1024;
const MAX_SPRITESHEET_BYTES: usize = 20 * 1024 * 1024;

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RemoteManifest {
    #[serde(default)]
    generated_at: String,
    #[serde(default)]
    total: usize,
    pets: Vec<RemotePet>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RemotePet {
    slug: String,
    display_name: String,
    #[serde(default)]
    kind: Option<String>,
    #[serde(default)]
    submitted_by: Option<String>,
    spritesheet_url: String,
    pet_json_url: String,
    sprite_version_number: u8,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PetdexPet {
    slug: String,
    display_name: String,
    kind: String,
    submitted_by: String,
    spritesheet_url: String,
    sprite_version_number: u8,
    installed: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PetdexManifestResult {
    generated_at: String,
    total: usize,
    pets: Vec<PetdexPet>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PetdexInstallResult {
    slug: String,
    display_name: String,
    directory_path: String,
    already_installed: bool,
    sprite_version_number: u8,
    method: &'static str,
}

struct CachedManifest {
    loaded_at: Instant,
    manifest: RemoteManifest,
}

static MANIFEST_CACHE: OnceLock<Mutex<Option<CachedManifest>>> = OnceLock::new();

fn manifest_cache() -> &'static Mutex<Option<CachedManifest>> {
    MANIFEST_CACHE.get_or_init(|| Mutex::new(None))
}

fn http_client() -> Result<Client, String> {
    Client::builder()
        .user_agent(format!(
            "codex-usage-companion/{}",
            env!("CARGO_PKG_VERSION")
        ))
        .connect_timeout(Duration::from_secs(12))
        .timeout(Duration::from_secs(35))
        .build()
        .map_err(|error| {
            format!("PETDEX_NETWORK::Could not initialize the Petdex client ({error})")
        })
}

fn download_limited(
    client: &Client,
    url: Url,
    max_bytes: usize,
    error_code: &str,
) -> Result<Vec<u8>, String> {
    let mut response = client
        .get(url)
        .send()
        .map_err(|error| format!("PETDEX_NETWORK::Could not reach Petdex ({error})"))?
        .error_for_status()
        .map_err(|error| format!("PETDEX_RESPONSE::Petdex returned an error ({error})"))?;

    if response
        .content_length()
        .is_some_and(|length| length > max_bytes as u64)
    {
        return Err(format!("{error_code}::The Petdex response is too large"));
    }

    let mut bytes = Vec::with_capacity(
        response
            .content_length()
            .unwrap_or_default()
            .min(max_bytes as u64) as usize,
    );
    response
        .by_ref()
        .take(max_bytes as u64 + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| format!("PETDEX_NETWORK::Could not read the Petdex response ({error})"))?;
    if bytes.len() > max_bytes {
        return Err(format!("{error_code}::The Petdex response is too large"));
    }
    Ok(bytes)
}

fn valid_slug(slug: &str) -> bool {
    !slug.is_empty()
        && slug.len() <= 96
        && slug
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
}

fn validate_asset_url(raw: &str) -> Result<Url, String> {
    let url = Url::parse(raw)
        .map_err(|_| "PETDEX_ASSET_URL::The Petdex asset URL is invalid".to_string())?;
    if url.scheme() != "https" || url.host_str() != Some(PETDEX_ASSET_HOST) {
        return Err("PETDEX_ASSET_URL::Pet assets must use the trusted Petdex asset host".into());
    }
    Ok(url)
}

fn fetch_remote_manifest() -> Result<RemoteManifest, String> {
    let client = http_client()?;
    let url = Url::parse(PETDEX_MANIFEST_URL)
        .map_err(|_| "PETDEX_MANIFEST::The Petdex manifest URL is invalid".to_string())?;
    let bytes = download_limited(&client, url, MAX_MANIFEST_BYTES, "PETDEX_MANIFEST_SIZE")?;
    let mut manifest: RemoteManifest = serde_json::from_slice(&bytes).map_err(|error| {
        format!("PETDEX_MANIFEST::Could not parse the Petdex manifest ({error})")
    })?;

    manifest.pets.retain(|pet| {
        valid_slug(&pet.slug)
            && !pet.display_name.trim().is_empty()
            && pet.display_name.chars().count() <= 80
            && matches!(pet.sprite_version_number, 1 | 2)
            && validate_asset_url(&pet.spritesheet_url).is_ok()
            && validate_asset_url(&pet.pet_json_url).is_ok()
    });
    if manifest.pets.is_empty() {
        return Err("PETDEX_MANIFEST::The Petdex manifest contains no compatible pets".into());
    }
    manifest.total = manifest.pets.len();
    Ok(manifest)
}

fn load_manifest(force: bool) -> Result<RemoteManifest, String> {
    if !force {
        let guard = manifest_cache()
            .lock()
            .map_err(|_| "PETDEX_CACHE::The Petdex cache lock was poisoned".to_string())?;
        if let Some(cached) = guard.as_ref() {
            if cached.loaded_at.elapsed() < MANIFEST_CACHE_TTL {
                return Ok(cached.manifest.clone());
            }
        }
    }

    let manifest = fetch_remote_manifest()?;
    let mut guard = manifest_cache()
        .lock()
        .map_err(|_| "PETDEX_CACHE::The Petdex cache lock was poisoned".to_string())?;
    *guard = Some(CachedManifest {
        loaded_at: Instant::now(),
        manifest: manifest.clone(),
    });
    Ok(manifest)
}

fn installed_pet_ids() -> HashSet<String> {
    let Ok(directory) = codex_pets_directory() else {
        return HashSet::new();
    };
    let Ok(entries) = fs::read_dir(directory) else {
        return HashSet::new();
    };
    entries
        .flatten()
        .filter(|entry| entry.path().join("pet.json").is_file())
        .filter_map(|entry| entry.file_name().to_str().map(str::to_owned))
        .collect()
}

#[tauri::command]
pub(crate) async fn fetch_petdex_manifest(
    force: Option<bool>,
) -> Result<PetdexManifestResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let manifest = load_manifest(force.unwrap_or(false))?;
        let installed = installed_pet_ids();
        let pets = manifest
            .pets
            .into_iter()
            .map(|pet| PetdexPet {
                installed: installed.contains(&pet.slug),
                slug: pet.slug,
                display_name: pet.display_name,
                kind: pet.kind.unwrap_or_default(),
                submitted_by: pet.submitted_by.unwrap_or_default(),
                spritesheet_url: pet.spritesheet_url,
                sprite_version_number: pet.sprite_version_number,
            })
            .collect::<Vec<_>>();
        Ok(PetdexManifestResult {
            generated_at: manifest.generated_at,
            total: pets.len(),
            pets,
        })
    })
    .await
    .map_err(|error| format!("PETDEX_TASK::{error}"))?
}

fn validate_spritesheet(bytes: &[u8], version: u8) -> Result<&'static str, String> {
    let reader = ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .map_err(|_| {
            "PETDEX_SPRITESHEET::The spritesheet format could not be detected".to_string()
        })?;
    let format = reader
        .format()
        .ok_or_else(|| "PETDEX_SPRITESHEET::The spritesheet format is missing".to_string())?;
    let (width, height) = reader.into_dimensions().map_err(|_| {
        "PETDEX_SPRITESHEET::The spritesheet dimensions could not be read".to_string()
    })?;
    let (rows, extension) = match (version, format) {
        (1, ImageFormat::Png) => (9, "png"),
        (1, ImageFormat::WebP) => (9, "webp"),
        (2, ImageFormat::Png) => (11, "png"),
        (2, ImageFormat::WebP) => (11, "webp"),
        _ => {
            return Err(
                "PETDEX_SPRITESHEET::Only PNG and WebP Petdex v1/v2 spritesheets are supported"
                    .into(),
            )
        }
    };
    let compatible_grid = width % 8 == 0
        && height % rows == 0
        && width <= 6144
        && height <= 9152
        && (width / 8) * 208 == (height / rows) * 192;
    if !compatible_grid {
        return Err(format!(
            "PETDEX_SPRITESHEET::The v{version} spritesheet has an incompatible {width}x{height} grid"
        ));
    }
    image::load_from_memory(bytes)
        .map_err(|_| "PETDEX_SPRITESHEET::The spritesheet image is damaged".to_string())?;
    Ok(extension)
}

fn existing_package_is_compatible(directory: &Path, pet: &RemotePet) -> bool {
    let Ok(bytes) = fs::read(directory.join("pet.json")) else {
        return false;
    };
    let Ok(manifest) = serde_json::from_slice::<Value>(&bytes) else {
        return false;
    };
    let id_matches = manifest.get("id").and_then(Value::as_str) == Some(pet.slug.as_str());
    let name_matches =
        manifest.get("displayName").and_then(Value::as_str) == Some(pet.display_name.as_str());
    id_matches && name_matches
}

fn unique_work_directory(parent: &Path, prefix: &str, slug: &str) -> PathBuf {
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();
    parent.join(format!(".{prefix}-{slug}-{stamp}"))
}

fn replace_package_directory(staging: &Path, destination: &Path) -> Result<bool, String> {
    if !destination.exists() {
        fs::rename(staging, destination).map_err(|error| {
            format!("PET_WRITE::Could not finish installing the pet package ({error})")
        })?;
        return Ok(false);
    }
    if !destination.is_dir() {
        return Err("PET_INSTALL_CONFLICT::A non-directory item already uses this pet ID".into());
    }

    let parent = destination
        .parent()
        .ok_or_else(|| "PET_DIRECTORY::The pet directory has no parent".to_string())?;
    let slug = destination
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("pet");
    let backup = unique_work_directory(parent, "codex-usage-companion-backup", slug);
    fs::rename(destination, &backup).map_err(|error| {
        format!("PET_WRITE::Could not prepare the existing pet for update ({error})")
    })?;
    if let Err(error) = fs::rename(staging, destination) {
        let _ = fs::rename(&backup, destination);
        return Err(format!(
            "PET_WRITE::Could not finish updating the pet package ({error})"
        ));
    }
    let _ = fs::remove_dir_all(backup);
    Ok(true)
}

fn install_pet(slug: &str) -> Result<PetdexInstallResult, String> {
    if !valid_slug(slug) {
        return Err("PETDEX_NOT_FOUND::The selected Petdex pet ID is invalid".into());
    }
    let mut manifest = load_manifest(false)?;
    let pet = if let Some(pet) = manifest.pets.into_iter().find(|pet| pet.slug == slug) {
        pet
    } else {
        manifest = load_manifest(true)?;
        manifest
            .pets
            .into_iter()
            .find(|pet| pet.slug == slug)
            .ok_or_else(|| {
                "PETDEX_NOT_FOUND::The selected pet is no longer in Petdex".to_string()
            })?
    };

    let client = http_client()?;
    let pet_json = download_limited(
        &client,
        validate_asset_url(&pet.pet_json_url)?,
        MAX_PET_JSON_BYTES,
        "PETDEX_PET_JSON_SIZE",
    )?;
    let remote_definition: Value = serde_json::from_slice(&pet_json)
        .map_err(|_| "PETDEX_PACKAGE::The Petdex pet.json is invalid".to_string())?;
    if remote_definition.get("id").and_then(Value::as_str) != Some(pet.slug.as_str()) {
        return Err("PETDEX_PACKAGE::The Petdex pet ID does not match its manifest".into());
    }
    let description = remote_definition
        .get("description")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim();

    let spritesheet = download_limited(
        &client,
        validate_asset_url(&pet.spritesheet_url)?,
        MAX_SPRITESHEET_BYTES,
        "PETDEX_SPRITESHEET_SIZE",
    )?;
    let extension = validate_spritesheet(&spritesheet, pet.sprite_version_number)?;

    let pets_directory = codex_pets_directory()?;
    fs::create_dir_all(&pets_directory).map_err(|error| {
        format!("PET_DIRECTORY::Could not create the Codex pets directory ({error})")
    })?;
    let destination = pets_directory.join(&pet.slug);
    if destination.exists() && !existing_package_is_compatible(&destination, &pet) {
        return Err(
            "PET_INSTALL_CONFLICT::A different local pet already uses this Petdex ID".into(),
        );
    }

    let staging =
        unique_work_directory(&pets_directory, "codex-usage-companion-install", &pet.slug);
    fs::create_dir(&staging)
        .map_err(|error| format!("PET_DIRECTORY::Could not prepare the pet package ({error})"))?;
    let spritesheet_name = format!("spritesheet.{extension}");
    let local_manifest = json!({
        "id": pet.slug,
        "displayName": pet.display_name,
        "description": description,
        "spriteVersionNumber": pet.sprite_version_number,
        "spritesheetPath": spritesheet_name,
    });
    let manifest_bytes = serde_json::to_vec_pretty(&local_manifest).map_err(|error| {
        format!("PETDEX_PACKAGE::Could not serialize the local pet manifest ({error})")
    })?;
    let write_result = fs::write(staging.join(&spritesheet_name), &spritesheet)
        .and_then(|_| fs::write(staging.join("pet.json"), manifest_bytes));
    if let Err(error) = write_result {
        let _ = fs::remove_dir_all(&staging);
        return Err(format!(
            "PET_WRITE::Could not write the pet package ({error})"
        ));
    }

    let already_installed = match replace_package_directory(&staging, &destination) {
        Ok(installed) => installed,
        Err(error) => {
            let _ = fs::remove_dir_all(&staging);
            return Err(error);
        }
    };
    Ok(PetdexInstallResult {
        slug: pet.slug,
        display_name: pet.display_name,
        directory_path: destination.to_string_lossy().into_owned(),
        already_installed,
        sprite_version_number: pet.sprite_version_number,
        method: "petdex-community-package",
    })
}

#[tauri::command]
pub(crate) async fn install_petdex_pet(slug: String) -> Result<PetdexInstallResult, String> {
    tauri::async_runtime::spawn_blocking(move || install_pet(&slug))
        .await
        .map_err(|error| format!("PETDEX_TASK::{error}"))?
}

#[cfg(test)]
mod tests {
    use super::{
        download_limited, fetch_remote_manifest, http_client, valid_slug, validate_asset_url,
        validate_spritesheet, MAX_SPRITESHEET_BYTES,
    };

    #[test]
    fn accepts_safe_petdex_slugs() {
        assert!(valid_slug("boba-cat_2"));
        assert!(!valid_slug("../boba"));
        assert!(!valid_slug("boba/cat"));
    }

    #[test]
    fn restricts_assets_to_the_petdex_asset_host() {
        assert!(validate_asset_url("https://assets.petdex.dev/pets/boba/sprite.webp").is_ok());
        assert!(validate_asset_url("http://assets.petdex.dev/pets/boba/sprite.webp").is_err());
        assert!(validate_asset_url("https://example.com/sprite.webp").is_err());
    }

    #[test]
    #[ignore = "requires live access to petdex.dev"]
    fn validates_a_live_petdex_manifest_and_package() {
        let manifest = fetch_remote_manifest().expect("live Petdex manifest should load");
        assert!(manifest.pets.len() > 1_000);
        let pet = manifest
            .pets
            .first()
            .expect("manifest should contain a pet");
        let client = http_client().expect("HTTP client should initialize");
        let spritesheet = download_limited(
            &client,
            validate_asset_url(&pet.spritesheet_url).expect("asset URL should be trusted"),
            MAX_SPRITESHEET_BYTES,
            "PETDEX_SPRITESHEET_SIZE",
        )
        .expect("live spritesheet should download");
        validate_spritesheet(&spritesheet, pet.sprite_version_number)
            .expect("live spritesheet should match the declared Petdex version");
        println!(
            "validated {} Petdex entries and package {}",
            manifest.pets.len(),
            pet.slug
        );
    }
}
