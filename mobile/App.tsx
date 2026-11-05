// The product UI is the web function's pages. The shell owns the frame: a native tab bar, one
// WebView per tab pinned to the origin, cookies shared with the native store. No API client, no
// token: the session cookie is born inside the WebView, and the native layer only picks URLs.
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { Pressable, StyleSheet, Text, useColorScheme, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";

export const ORIGIN = "https://rscmfe.sph.sh";
// Appended to the User-Agent. The web app keys its chrome off it and renders pages without the web nav.
const SHELL_UA = "RSCShell/1";

// The shell's colors follow the device theme and match the web app's Tailwind tokens (white /
// gray-950 page, neutral borders and labels), so the frame and the page change together.
const themes = {
  light: { bg: "#ffffff", border: "#e5e5e5", label: "#737373", active: "#171717" },
  dark: { bg: "#030712", border: "#262626", label: "#a3a3a3", active: "#f5f5f5" },
} as const;

const tabs = [
  { key: "home", label: "Home", path: "/" },
  { key: "orders", label: "Orders", path: "/orders" },
] as const;
type TabKey = (typeof tabs)[number]["key"];

export default function App() {
  const [active, setActive] = useState<TabKey>("home");
  const theme = themes[useColorScheme() === "dark" ? "dark" : "light"];
  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <SafeAreaView style={[styles.root, { backgroundColor: theme.bg }]} edges={["top", "bottom"]}>
        {/* One WebView per tab: each keeps its own history and scroll, like native stacks. Inactive
          tabs stay laid out at full size (opacity, not display:none): a WKWebView that was laid
          out at zero height scrolls its content to the bottom when it is shown. */}
        <View style={styles.pages}>
          {tabs.map((tab) => (
            <View
              key={tab.key}
              style={[
                StyleSheet.absoluteFill,
                active !== tab.key && styles.hidden,
              ]}
              pointerEvents={active === tab.key ? "auto" : "none"}
            >
              <WebView
                // The page paints its own theme through prefers-color-scheme; this only covers the
                // frames before the first paint, which would otherwise flash white in dark mode.
                style={[styles.page, { backgroundColor: theme.bg }]}
                source={{ uri: `${ORIGIN}${tab.path}` }}
                applicationNameForUserAgent={SHELL_UA}
                sharedCookiesEnabled
                allowsBackForwardNavigationGestures
                // Anything off-origin would leave the product; keep it inside the shell's one domain.
                // Compare origins, not prefixes: a startsWith check also matches look-alike hosts.
                onShouldStartLoadWithRequest={(req) => new URL(req.url).origin === ORIGIN}
              />
            </View>
          ))}
        </View>
        <View style={[styles.bar, { borderTopColor: theme.border }]}>
          {tabs.map((tab) => (
            <Pressable
              key={tab.key}
              onPress={() => setActive(tab.key)}
              style={styles.tab}
            >
              <Text
                style={[
                  styles.label,
                  { color: active === tab.key ? theme.active : theme.label },
                  active === tab.key && styles.labelActive,
                ]}
              >
                {tab.label}
              </Text>
            </Pressable>
          ))}
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
  tab: { flex: 1, alignItems: "center", paddingVertical: 12 },
  label: { fontSize: 13 },
  labelActive: { fontWeight: "600" },
});
