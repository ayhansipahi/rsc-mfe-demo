// The product UI is the web function's pages. The shell owns the frame: a native tab bar, one
// WebView per tab pinned to the origin, all tabs on WebKit's one default cookie store. No API
// client, no token: the session cookie is born inside the WebView, and the native layer only
// picks URLs. Not sharedCookiesEnabled: it copies cookies into the app's native jar but never
// deletes them there, then seeds every new WebView from that jar, so a signed-out session returns.
// The pages tell the shell UI state (signed in or not, cart count) over postMessage, never a token.
import Ionicons from "@expo/vector-icons/Ionicons";
import { StatusBar } from "expo-status-bar";
import { useRef, useState } from "react";
import { Pressable, StyleSheet, Text, useColorScheme, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

export const ORIGIN = "https://rscmfe.sph.sh";
// Appended to the User-Agent. The web app keys its chrome off it and renders pages without the web nav.
const SHELL_UA = "RSCShell/1";

// The shell's colors follow the device theme and match the web app's Tailwind tokens (white /
// gray-950 page, neutral borders and labels), so the frame and the page change together.
const themes = {
  light: { bg: "#ffffff", border: "#e5e5e5", label: "#737373", active: "#171717", badgeText: "#ffffff" },
  dark: { bg: "#030712", border: "#262626", label: "#a3a3a3", active: "#f5f5f5", badgeText: "#030712" },
} as const;

interface Tab {
  key: string;
  label: string;
  path: string;
  icon: keyof typeof Ionicons.glyphMap;
  // true: only with a session. false: only without one. Unset: always.
  auth?: boolean;
}

// The tab bar is the shell's auth UI. Signed out, the tabs that need a session are not in the bar
// and a Sign in tab is, so no tab ever opens on a login page. Signed in, that slot is the Account
// tab: the account vertical's page with passkeys and sign out.
const tabs: Tab[] = [
  { key: "home", label: "Home", path: "/", icon: "home-outline" },
  { key: "store", label: "Store", path: "/store", icon: "storefront-outline" },
  { key: "cart", label: "Cart", path: "/store/cart", icon: "cart-outline", auth: true },
  { key: "orders", label: "Orders", path: "/orders", icon: "receipt-outline", auth: true },
  { key: "account", label: "Account", path: "/account", icon: "person-circle", auth: true },
  { key: "signin", label: "Sign in", path: "/login?next=/store", icon: "person-circle-outline", auth: false },
];

type ShellMessage =
  | { type: "session"; signedIn: boolean; email?: string }
  | { type: "cart"; count: number }
  | { type: "auth-required" };

export default function App() {
  const theme = themes[useColorScheme() === "dark" ? "dark" : "light"];
  const [active, setActive] = useState("home");
  const [signedIn, setSignedIn] = useState(false);
  const [cartCount, setCartCount] = useState(0);
  // Bumped when the session flips: every tab reloads, so no page keeps rendering the old session.
  const [epoch, setEpoch] = useState(0);
  const knownSession = useRef<boolean | null>(null);
  const returnTo = useRef<string | null>(null);
  const views = useRef<Record<string, { injectJavaScript(js: string): void } | null>>({});

  const visible = tabs.filter((tab) => tab.auth === undefined || tab.auth === signedIn);

  function onMessage(event: WebViewMessageEvent) {
    let msg: ShellMessage;
    try {
      msg = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }
    if (msg.type === "cart") setCartCount(msg.count);
    if (msg.type === "auth-required") {
      // A guest tapped something that needs a session: sign in, then come back to this tab.
      returnTo.current = active;
      setActive("signin");
    }
    if (msg.type === "session") {
      const flipped = knownSession.current !== null && knownSession.current !== msg.signedIn;
      knownSession.current = msg.signedIn;
      setSignedIn(msg.signedIn);
      if (flipped) {
        setEpoch((n) => n + 1);
        setActive((msg.signedIn && returnTo.current) || "store");
        returnTo.current = null;
      }
    }
  }

  function select(key: string) {
    // The cart page is server-rendered; adds from the Store tab happened in another WebView.
    // A page-side reload, not WebView.reload(): that one shows the library's white loading view.
    if (key === "cart") views.current.cart?.injectJavaScript("location.reload();true;");
    setActive(key);
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <SafeAreaView style={[styles.root, { backgroundColor: theme.bg }]} edges={["top", "bottom"]}>
        {/* One WebView per tab: each keeps its own history and scroll, like native stacks. Inactive
          tabs stay laid out at full size (opacity, not display:none): a WKWebView that was laid
          out at zero height scrolls its content to the bottom when it is shown. */}
        <View style={styles.pages}>
          {visible.map((tab) => (
            <View
              key={`${tab.key}-${epoch}`}
              style={[StyleSheet.absoluteFill, active !== tab.key && styles.hidden]}
              pointerEvents={active === tab.key ? "auto" : "none"}
            >
              <WebView
                ref={(view) => {
                  views.current[tab.key] = view;
                }}
                // The page paints its own theme through prefers-color-scheme; this only covers the
                // frames before the first paint, which would otherwise flash white in dark mode.
                style={[styles.page, { backgroundColor: theme.bg }]}
                source={{ uri: `${ORIGIN}${tab.path}` }}
                applicationNameForUserAgent={SHELL_UA}
                allowsBackForwardNavigationGestures
                onMessage={onMessage}
                // Anything off-origin would leave the product; keep it inside the shell's one domain.
                // Compare origins, not prefixes: a startsWith check also matches look-alike hosts.
                onShouldStartLoadWithRequest={(req) => new URL(req.url).origin === ORIGIN}
              />
            </View>
          ))}
        </View>
        <View style={[styles.bar, { borderTopColor: theme.border }]}>
          {visible.map((tab) => {
            const color = active === tab.key ? theme.active : theme.label;
            return (
              <Pressable key={tab.key} onPress={() => select(tab.key)} style={styles.tab}>
                <View>
                  <Ionicons name={tab.icon} size={22} color={color} />
                  {tab.key === "cart" && cartCount > 0 && (
                    <View style={[styles.badge, { backgroundColor: theme.active }]}>
                      <Text style={[styles.badgeText, { color: theme.badgeText }]}>{cartCount}</Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.label, { color }, active === tab.key && styles.labelActive]}>
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  pages: { flex: 1 },
  page: { flex: 1 },
  hidden: { opacity: 0 },
  bar: {
    flexDirection: "row",
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  tab: { flex: 1, alignItems: "center", paddingTop: 8, paddingBottom: 6, gap: 2 },
  label: { fontSize: 11 },
  labelActive: { fontWeight: "600" },
  badge: {
    position: "absolute",
    top: -4,
    right: -10,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { fontSize: 10, fontWeight: "700" },
});
