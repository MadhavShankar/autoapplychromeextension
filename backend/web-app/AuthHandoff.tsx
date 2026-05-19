// ═══════════════════════════════════════════════════════════════
// WisOwl Web App · Auth Handoff Component (React / Next.js)
// Embeds in app.wisowl.com dashboard to pass Supabase JWT to
// the Chrome Extension via chrome.runtime.sendMessage.
//
// Prerequisites:
// 1. Chrome Extension ID must be hardcoded (from Chrome Web Store)
// 2. Supabase client initialized in parent app
// 3. User must have extension installed
// ═══════════════════════════════════════════════════════════════

import React, { useEffect, useState, useCallback } from "react";

// ── Configuration ──
// REPLACE THIS with your actual Extension ID from Chrome Web Store
// Format: 32-char alphanumeric string
const EXTENSION_ID = "abcdefghijklmnopabcdefghijklmnop";

// ── Types ──
interface AuthTokenPayload {
  token: string;
  expires_at: string;
  user_id: string;
  extension_id: string;
}

interface ExtensionStatus {
  installed: boolean;
  version?: string;
  ready: boolean;
}

// ── Helper: Check if extension is installed ──
function checkExtensionInstalled(): Promise<ExtensionStatus> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !window.chrome?.runtime) {
      resolve({ installed: false, ready: false });
      return;
    }

    const timeout = setTimeout(() => {
      resolve({ installed: false, ready: false });
    }, 2000);

    try {
      window.chrome.runtime.sendMessage(
        EXTENSION_ID,
        { type: "PING" },
        (response) => {
          clearTimeout(timeout);
          if (window.chrome.runtime.lastError) {
            resolve({ installed: false, ready: false });
            return;
          }
          resolve({
            installed: true,
            version: response?.version,
            ready: response?.ready ?? false,
          });
        }
      );
    } catch {
      clearTimeout(timeout);
      resolve({ installed: false, ready: false });
    }
  });
}

// ── Helper: Send auth token to extension ──
function sendTokenToExtension(payload: AuthTokenPayload): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !window.chrome?.runtime) {
      resolve(false);
      return;
    }

    const timeout = setTimeout(() => {
      resolve(false);
    }, 5000);

    try {
      window.chrome.runtime.sendMessage(
        EXTENSION_ID,
        payload,
        (response) => {
          clearTimeout(timeout);
          if (window.chrome.runtime.lastError) {
            console.error("Extension auth error:", window.chrome.runtime.lastError.message);
            resolve(false);
            return;
          }
          resolve(response?.ok === true);
        }
      );
    } catch (err) {
      clearTimeout(timeout);
      console.error("Failed to send token:", err);
      resolve(false);
    }
  });
}

// ── Component Props ──
interface AuthHandoffProps {
  supabaseSession: {
    access_token: string;
    expires_at?: number; // Unix timestamp (seconds)
    user: { id: string; email: string };
  } | null;
}

// ── Component ──
export const AuthHandoff: React.FC<AuthHandoffProps> = ({ supabaseSession }) => {
  const [status, setStatus] = useState<ExtensionStatus>({ installed: false, ready: false });
  const [syncing, setSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Check extension status on mount
  useEffect(() => {
    checkExtensionInstalled().then(setStatus);
  }, []);

  // Auto-sync when session changes
  useEffect(() => {
    if (!supabaseSession?.access_token || !status.installed) return;

    const sync = async () => {
      setSyncing(true);
      setError(null);

      const payload: AuthTokenPayload = {
        token: supabaseSession.access_token,
        expires_at: supabaseSession.expires_at
          ? new Date(supabaseSession.expires_at * 1000).toISOString()
          : new Date(Date.now() + 3600 * 1000).toISOString(),
        user_id: supabaseSession.user.id,
        extension_id: EXTENSION_ID,
      };

      const ok = await sendTokenToExtension(payload);
      if (ok) {
        setLastSynced(new Date());
      } else {
        setError("Extension did not acknowledge auth token. Please ensure the extension is active.");
      }

      setSyncing(false);
    };

    sync();
  }, [supabaseSession, status.installed]);

  const handleManualSync = useCallback(async () => {
    if (!supabaseSession?.access_token) {
      setError("No active session found. Please log in.");
      return;
    }

    setSyncing(true);
    setError(null);

    // Re-check extension status
    const extStatus = await checkExtensionInstalled();
    setStatus(extStatus);

    if (!extStatus.installed) {
      setError("Extension not detected. Please install WisOwl Auto-Apply from the Chrome Web Store.");
      setSyncing(false);
      return;
    }

    const payload: AuthTokenPayload = {
      token: supabaseSession.access_token,
      expires_at: supabaseSession.expires_at
        ? new Date(supabaseSession.expires_at * 1000).toISOString()
        : new Date(Date.now() + 3600 * 1000).toISOString(),
      user_id: supabaseSession.user.id,
      extension_id: EXTENSION_ID,
    };

    const ok = await sendTokenToExtension(payload);
    if (ok) {
      setLastSynced(new Date());
    } else {
      setError("Failed to sync with extension. Try refreshing the page.");
    }

    setSyncing(false);
  }, [supabaseSession]);

  return (
    <div className="wisowl-auth-handoff" style={styles.container}>
      <div style={styles.header}>
        <h3 style={styles.title}>Chrome Extension</h3>
        <span
          style={{
            ...styles.badge,
            backgroundColor: status.installed ? "#10b981" : "#ef4444",
          }}
        >
          {status.installed ? "Installed" : "Not Installed"}
        </span>
      </div>

      {status.installed && (
        <p style={styles.version}>Version: {status.version ?? "unknown"}</p>
      )}

      {!status.installed && (
        <div style={styles.alert}>
          <p style={styles.alertText}>
            The WisOwl Auto-Apply extension is not detected.
            Install it from the{" "}
            <a
              href={`https://chrome.google.com/webstore/detail/${EXTENSION_ID}`}
              target="_blank"
              rel="noopener noreferrer"
              style={styles.link}
            >
              Chrome Web Store
            </a>{" "}
            to enable auto-apply.
          </p>
        </div>
      )}

      {status.installed && (
        <div style={styles.syncSection}>
          <button
            onClick={handleManualSync}
            disabled={syncing}
            style={{
              ...styles.button,
              opacity: syncing ? 0.6 : 1,
              cursor: syncing ? "not-allowed" : "pointer",
            }}
          >
            {syncing ? "Syncing..." : "Sync Auth Token"}
          </button>

          {lastSynced && (
            <p style={styles.syncTime}>
              Last synced: {lastSynced.toLocaleTimeString()}
            </p>
          )}
        </div>
      )}

      {error && <p style={styles.error}>{error}</p>}
    </div>
  );
};

// ── Inline Styles (replace with your design system) ──
const styles: Record<string, React.CSSProperties> = {
  container: {
    border: "1px solid #e5e7eb",
    borderRadius: "8px",
    padding: "16px",
    maxWidth: "400px",
    fontFamily: "system-ui, -apple-system, sans-serif",
    backgroundColor: "#ffffff",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "12px",
  },
  title: {
    margin: 0,
    fontSize: "16px",
    fontWeight: 600,
    color: "#111827",
  },
  badge: {
    padding: "4px 10px",
    borderRadius: "9999px",
    fontSize: "12px",
    fontWeight: 500,
    color: "#ffffff",
  },
  version: {
    margin: "0 0 12px 0",
    fontSize: "13px",
    color: "#6b7280",
  },
  alert: {
    backgroundColor: "#fef2f2",
    border: "1px solid #fecaca",
    borderRadius: "6px",
    padding: "12px",
  },
  alertText: {
    margin: 0,
    fontSize: "13px",
    color: "#991b1b",
    lineHeight: 1.5,
  },
  link: {
    color: "#dc2626",
    textDecoration: "underline",
    fontWeight: 500,
  },
  syncSection: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  button: {
    padding: "8px 16px",
    backgroundColor: "#2563eb",
    color: "#ffffff",
    border: "none",
    borderRadius: "6px",
    fontSize: "14px",
    fontWeight: 500,
  },
  syncTime: {
    margin: 0,
    fontSize: "12px",
    color: "#6b7280",
  },
  error: {
    margin: "8px 0 0 0",
    fontSize: "13px",
    color: "#dc2626",
  },
};

export default AuthHandoff;
