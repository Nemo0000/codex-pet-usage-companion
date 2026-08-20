import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  LoaderCircle,
  PackageCheck,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  WifiOff,
  X,
} from "lucide-react";
import { translate, type TranslationKey } from "../i18n";
import { filterPetdexPets, getPetdexKinds, pagePetdexPets } from "../lib/petdex";
import {
  fetchPetdexManifest,
  installPetdexPet,
  openPetdexPetPage,
  parseBackendError,
  syncOfficialCustomPet,
  uninstallPetdexPet,
} from "../lib/platform";
import type { Language, PetdexManifestResult, PetdexPet } from "../types";

type InstallMode = "install" | "install-and-use" | "uninstall";
type NoticeTone = "success" | "warning" | "error";

interface GalleryNotice {
  tone: NoticeTone;
  text: string;
}

function PetdexSpritePreview({ pet }: { pet: PetdexPet }) {
  const [failed, setFailed] = useState(false);
  const rows = pet.spriteVersionNumber === 2 ? 11 : 9;
  const style = { "--petdex-rows": String(rows) } as CSSProperties;
  const fallback = pet.displayName.trim().slice(0, 1).toLocaleUpperCase() || "P";

  return (
    <span className="petdex-sprite" role="img" aria-label={pet.displayName} style={style}>
      {!failed && pet.spritesheetUrl ? (
        <img
          src={pet.spritesheetUrl}
          alt=""
          loading="lazy"
          decoding="async"
          draggable="false"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="petdex-sprite__fallback" aria-hidden="true">{fallback}</span>
      )}
    </span>
  );
}

function syncErrorMessage(language: Language, code: string): string {
  const key: TranslationKey =
    code === "CHATGPT_NOT_RUNNING"
      ? "officialPetSyncChatGPTNotRunning"
      : code === "CHATGPT_NOT_INSTALLED"
        ? "officialPetSyncChatGPTNotInstalled"
        : code === "CHATGPT_LAUNCH_FAILED"
          ? "officialPetSyncLaunchFailed"
          : code === "SETTINGS_NAVIGATION_FAILED"
            ? "officialPetSyncSettingsNavigationFailed"
      : code === "PETS_SETTINGS_NOT_OPEN"
        ? "officialPetSyncSettingsClosed"
        : code === "CUSTOM_PET_NOT_FOUND"
          ? "officialCustomPetNotFound"
          : code === "PETS_REFRESH_FAILED"
            ? "officialCustomPetRefreshFailed"
            : code === "SELECT_BUTTON_NOT_FOUND" || code === "SELECT_INVOKE_FAILED" || code === "SELECTION_NOT_CONFIRMED"
              ? "officialPetSyncSelectUnavailable"
              : code === "UNSUPPORTED_PLATFORM"
                ? "officialPetSyncUnsupported"
                : "officialPetSyncError";
  return translate(language, key);
}

function installErrorMessage(language: Language, code: string): string {
  const key: TranslationKey =
    code === "PETDEX_NETWORK" || code === "PETDEX_RESPONSE"
      ? "petdexNetworkError"
      : code === "PET_INSTALL_CONFLICT"
        ? "petdexConflictError"
        : code.startsWith("PETDEX_")
          ? "petdexPackageError"
          : "petdexInstallError";
  return translate(language, key);
}

export function CommunityPetsPanel({ language, officialDesktopPath }: { language: Language; officialDesktopPath: string }) {
  const [manifest, setManifest] = useState<PetdexManifestResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("");
  const [page, setPage] = useState(1);
  const [activeAction, setActiveAction] = useState<{ slug: string; mode: InstallMode } | null>(null);
  const [notice, setNotice] = useState<GalleryNotice | null>(null);
  const deferredQuery = useDeferredValue(query);

  const loadManifest = useCallback(async (force: boolean) => {
    setLoading(true);
    setLoadError(null);
    try {
      setManifest(await fetchPetdexManifest(force));
    } catch (caught) {
      const { code } = parseBackendError(caught);
      setLoadError(
        translate(
          language,
          code === "PETDEX_NETWORK" || code === "PETDEX_RESPONSE"
            ? "petdexNetworkError"
            : "petdexDataError",
        ),
      );
    } finally {
      setLoading(false);
    }
  }, [language]);

  useEffect(() => {
    void loadManifest(false);
  }, [loadManifest]);

  const kinds = useMemo(() => getPetdexKinds(manifest?.pets ?? []), [manifest]);
  const filteredPets = useMemo(
    () => filterPetdexPets(manifest?.pets ?? [], deferredQuery, kind),
    [deferredQuery, kind, manifest],
  );
  const pageData = useMemo(() => pagePetdexPets(filteredPets, page), [filteredPets, page]);
  const busy = activeAction !== null;

  const clearFilters = () => {
    setQuery("");
    setKind("");
    setPage(1);
    setNotice(null);
  };

  const handleInstall = async (pet: PetdexPet, mode: InstallMode) => {
    setActiveAction({ slug: pet.slug, mode });
    setNotice(null);
    try {
      const installed = await installPetdexPet(pet.slug);
      setManifest((current) => current && {
        ...current,
        pets: current.pets.map((candidate) =>
          candidate.slug === pet.slug ? { ...candidate, installed: true } : candidate,
        ),
      });

      if (mode === "install") {
        setNotice({
          tone: "success",
          text: translate(language, "petdexInstalledSuccess", { name: installed.displayName }),
        });
        return;
      }

      try {
        await syncOfficialCustomPet(installed.displayName, officialDesktopPath);
        setNotice({
          tone: "success",
          text: translate(language, "petdexSelectedSuccess", { name: installed.displayName }),
        });
      } catch (caught) {
        const { code } = parseBackendError(caught);
        setNotice({
          tone: "warning",
          text: translate(language, "petdexPartialSuccess", {
            name: installed.displayName,
            reason: syncErrorMessage(language, code),
          }),
        });
      }
    } catch (caught) {
      const { code } = parseBackendError(caught);
      setNotice({ tone: "error", text: installErrorMessage(language, code) });
    } finally {
      setActiveAction(null);
    }
  };

  const handleUninstall = async (pet: PetdexPet) => {
    if (!window.confirm(translate(language, "petdexUninstallConfirm", { name: pet.displayName }))) return;
    setActiveAction({ slug: pet.slug, mode: "uninstall" });
    setNotice(null);
    try {
      await uninstallPetdexPet(pet.slug);
      setManifest((current) => current && {
        ...current,
        pets: current.pets.map((candidate) =>
          candidate.slug === pet.slug ? { ...candidate, installed: false } : candidate,
        ),
      });
      setNotice({
        tone: "success",
        text: translate(language, "petdexUninstalledSuccess", { name: pet.displayName }),
      });
    } catch (caught) {
      const { code } = parseBackendError(caught);
      setNotice({ tone: "error", text: installErrorMessage(language, code) });
    } finally {
      setActiveAction(null);
    }
  };

  const handleOpenSource = async (pet: PetdexPet) => {
    try {
      await openPetdexPetPage(pet.slug);
    } catch {
      setNotice({ tone: "error", text: translate(language, "petdexSourceError") });
    }
  };

  if (loading && !manifest) {
    return (
      <section className="petdex-gallery petdex-gallery--loading" aria-live="polite" aria-busy="true">
        <div className="petdex-gallery__intro">
          <span className="petdex-gallery__eyebrow">Petdex</span>
          <h3>{translate(language, "communityPetsTitle")}</h3>
          <p>{translate(language, "petdexLoadingBody")}</p>
        </div>
        <div className="petdex-skeleton-grid" aria-hidden="true">
          {Array.from({ length: 4 }, (_, index) => <span className="petdex-skeleton-card" key={index} />)}
        </div>
        <span className="sr-only">{translate(language, "petdexLoading")}</span>
      </section>
    );
  }

  if (!manifest) {
    return (
      <section className="petdex-gallery petdex-gallery--state" role="alert">
        <WifiOff size={34} aria-hidden="true" />
        <h3>{translate(language, "petdexErrorTitle")}</h3>
        <p>{loadError || translate(language, "petdexDataError")}</p>
        <button className="primary-button" type="button" onClick={() => void loadManifest(true)}>
          <RefreshCw size={15} aria-hidden="true" />
          {translate(language, "petdexRetry")}
        </button>
      </section>
    );
  }

  return (
    <section className="petdex-gallery" aria-label={translate(language, "communityPetsTitle")}>
      <div className="petdex-gallery__intro">
        <div>
          <span className="petdex-gallery__eyebrow">Petdex</span>
          <h3>{translate(language, "communityPetsTitle")}</h3>
          <p>{translate(language, "communityPetsIntro")}</p>
        </div>
        <button
          className="icon-button petdex-refresh"
          type="button"
          onClick={() => void loadManifest(true)}
          disabled={loading || busy}
          aria-label={translate(language, "petdexRefresh")}
        >
          {loading ? <LoaderCircle className="spin" size={16} aria-hidden="true" /> : <RefreshCw size={16} aria-hidden="true" />}
        </button>
      </div>

      <div className="petdex-gallery__stats">
        <PackageCheck size={14} aria-hidden="true" />
        {translate(language, "petdexTotal", { count: manifest.total })}
      </div>

      <div className="petdex-controls">
        <div className="petdex-search">
          <Search size={15} aria-hidden="true" />
          <input
            type="search"
            value={query}
            aria-label={translate(language, "petdexSearchLabel")}
            placeholder={translate(language, "petdexSearchPlaceholder")}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
              setNotice(null);
            }}
          />
          {query && (
            <button type="button" onClick={() => { setQuery(""); setPage(1); setNotice(null); }} aria-label={translate(language, "petdexClearSearch") }>
              <X size={13} aria-hidden="true" />
            </button>
          )}
        </div>
        <label className="petdex-kind-filter">
          <span className="sr-only">{translate(language, "petdexKindLabel")}</span>
          <select
            value={kind}
            onChange={(event) => {
              setKind(event.target.value);
              setPage(1);
              setNotice(null);
            }}
          >
            <option value="">{translate(language, "petdexAllKinds")}</option>
            {kinds.map((option) => (
              <option key={option.value} value={option.value}>{option.value} · {option.count}</option>
            ))}
          </select>
        </label>
      </div>

      {loadError && (
        <div className="petdex-inline-message petdex-inline-message--warning" role="status">
          <AlertTriangle size={15} aria-hidden="true" />
          <span>{loadError}</span>
        </div>
      )}

      {notice && (
        <div
          className={`petdex-inline-message petdex-inline-message--${notice.tone}`}
          role={notice.tone === "error" ? "alert" : "status"}
        >
          {notice.tone === "success" ? <CheckCircle2 size={15} aria-hidden="true" /> : <AlertTriangle size={15} aria-hidden="true" />}
          <span>{notice.text}</span>
        </div>
      )}

      {pageData.items.length > 0 ? (
        <div className="petdex-card-grid" aria-busy={busy}>
          {pageData.items.map((pet) => {
            const installing = activeAction?.slug === pet.slug;
            const installOnly = installing && activeAction.mode === "install";
            const installAndUse = installing && activeAction.mode === "install-and-use";
            const uninstalling = installing && activeAction.mode === "uninstall";
            return (
              <article className={`petdex-card${pet.installed ? " petdex-card--installed" : ""}`} key={pet.slug}>
                <div className="petdex-card__visual">
                  <PetdexSpritePreview pet={pet} />
                  {pet.installed && <span className="petdex-installed-badge">{translate(language, "petdexInstalled")}</span>}
                </div>
                <div className="petdex-card__copy">
                  <h4 title={pet.displayName}>{pet.displayName}</h4>
                  <p>{translate(language, "petdexSubmittedBy", { name: pet.submittedBy || "Petdex" })}</p>
                  <span>v{pet.spriteVersionNumber} · {pet.kind || "pet"}</span>
                </div>
                <div className="petdex-card__actions">
                  <button
                    className="petdex-source-button"
                    type="button"
                    onClick={() => void handleOpenSource(pet)}
                    disabled={busy}
                    aria-label={translate(language, "petdexSourceLabel", { name: pet.displayName })}
                    title={translate(language, "petdexSource")}
                  >
                    <ExternalLink size={14} aria-hidden="true" />
                  </button>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => void handleInstall(pet, "install")}
                    disabled={busy}
                  >
                    {installOnly ? <LoaderCircle className="spin" size={14} aria-hidden="true" /> : <Download size={14} aria-hidden="true" />}
                    {translate(language, installOnly ? "petdexInstalling" : pet.installed ? "petdexReinstall" : "petdexInstall")}
                  </button>
                  <button
                    className="primary-button"
                    type="button"
                    onClick={() => void handleInstall(pet, "install-and-use")}
                    disabled={busy}
                  >
                    {installAndUse ? <LoaderCircle className="spin" size={14} aria-hidden="true" /> : <Sparkles size={14} aria-hidden="true" />}
                    {translate(language, installAndUse ? "petdexSelecting" : "petdexInstallUse")}
                  </button>
                  {pet.installed && (
                    <button
                      className="petdex-uninstall-button"
                      type="button"
                      onClick={() => void handleUninstall(pet)}
                      disabled={busy}
                    >
                      {uninstalling ? <LoaderCircle className="spin" size={14} aria-hidden="true" /> : <Trash2 size={14} aria-hidden="true" />}
                      {translate(language, uninstalling ? "petdexUninstalling" : "petdexUninstall")}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="petdex-empty-state">
          <Search size={30} aria-hidden="true" />
          <h4>{translate(language, "petdexEmptyTitle")}</h4>
          <p>{translate(language, "petdexEmptyBody")}</p>
          <button className="secondary-button" type="button" onClick={clearFilters}>
            {translate(language, "petdexClearFilters")}
          </button>
        </div>
      )}

      {pageData.items.length > 0 && (
        <nav className="petdex-pagination" aria-label={translate(language, "petdexPagination") }>
          <button
            className="icon-button"
            type="button"
            onClick={() => setPage(pageData.page - 1)}
            disabled={pageData.page <= 1 || busy}
            aria-label={translate(language, "petdexPrevious")}
          >
            <ChevronLeft size={16} aria-hidden="true" />
          </button>
          <span>{translate(language, "petdexPage", { page: pageData.page, count: pageData.pageCount })}</span>
          <button
            className="icon-button"
            type="button"
            onClick={() => setPage(pageData.page + 1)}
            disabled={pageData.page >= pageData.pageCount || busy}
            aria-label={translate(language, "petdexNext")}
          >
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </nav>
      )}

      <p className="petdex-license-note">{translate(language, "petdexLicenseNote")}</p>
    </section>
  );
}
