// The product UI is the web function's pages. The shell owns the frame: the system tab bar (expo-router
// NativeTabs, a UITabBarController, so Liquid Glass on iOS 26+), one WebView per tab pinned to the
// origin, all tabs on WebKit's one default cookie store. No API client, no token: the session cookie is
// born inside the WebView, and the native layer only picks URLs. Not sharedCookiesEnabled: it copies
// cookies into the app's native jar but never deletes them there, then seeds every new WebView from
// that jar, so a signed-out session returns.
// The pages tell the shell UI state (signed in or not, cart count) over postMessage, never a token.
// Two native capabilities sit on top. A Face ID lock on launch and on return from the background: it
// gates the screen, not the session; signing in stays the page's passkey ceremony. And the camera:
// the Store tab's accessory takes a photo and hands it to the page, which owns the search call.
// app/ holds one route file per tab; each re-exports Page or this layout.
import Ionicons from "@expo/vector-icons/Ionicons";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import * as LocalAuthentication from "expo-local-authentication";
import { useFocusEffect, usePathname, useRouter } from "expo-router";
import { DarkTheme, DefaultTheme, ThemeProvider, useRoute } from "expo-router/react-navigation";
import { NativeTabs, type MaterialIcon, type SFSymbolIcon } from "expo-router/native-tabs";
import { StatusBar } from "expo-status-bar";
import { createContext, use, useCallback, useEffect, useRef, useState } from "react";
import { AppState, DynamicColorIOS, Platform, Pressable, StyleSheet, Text, useColorScheme, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

export const ORIGIN = "https://rscmfe.sph.sh";
// Appended to the User-Agent. The web app keys its chrome off it and renders pages without the web nav.
const SHELL_UA = "RSCShell/1";

// The shell's colors follow the device theme and match the web app's Tailwind tokens (white /
// gray-950 page, neutral labels), so the frame and the page change together.
const themes = {
  light: { bg: "#ffffff", active: "#171717" },
  dark: { bg: "#030712", active: "#f5f5f5" },
} as const;
// The glass bar picks light or dark from the content behind it, not from the device theme, so the
// selected tab's tint resolves per bar, not per app.
const tint = Platform.OS === "ios" ? DynamicColorIOS({ light: themes.light.active, dark: themes.dark.active }) : undefined;

interface Tab {
  // The route file under app/.
  name: string;
  label: string;
  path: string;
  icon: Pick<SFSymbolIcon, "sf"> & Pick<MaterialIcon, "md">;
  // true: only with a session. false: only without one. Unset: always.
  auth?: boolean;
}

// The tab bar is the shell's auth UI. Signed out, the tabs that need a session are not in the bar
// and a Sign in tab is, so no tab ever opens on a login page. Signed in, that slot is the Account
// tab: the account vertical's page with passkeys and sign out.
const tabs: Tab[] = [
  { name: "index", label: "Home", path: "/", icon: { sf: { default: "house", selected: "house.fill" }, md: "home" } },
  { name: "store", label: "Store", path: "/store", icon: { sf: { default: "storefront", selected: "storefront.fill" }, md: "storefront" } },
  { name: "cart", label: "Cart", path: "/store/cart", icon: { sf: { default: "cart", selected: "cart.fill" }, md: "shopping_cart" }, auth: true },
  { name: "orders", label: "Orders", path: "/orders", icon: { sf: { default: "shippingbox", selected: "shippingbox.fill" }, md: "package_2" }, auth: true },
  { name: "account", label: "Account", path: "/account", icon: { sf: { default: "person.crop.circle", selected: "person.crop.circle.fill" }, md: "account_circle" }, auth: true },
  { name: "signin", label: "Sign in", path: "/login?next=/store", icon: { sf: "person.crop.circle", md: "login" }, auth: false },
];

type ShellMessage =
  | { type: "session"; signedIn: boolean; email?: string }
  | { type: "cart"; count: number }
  | { type: "auth-required" };

interface WebViewHandle {
  injectJavaScript(js: string): void;
}

const Shell = createContext<{
  bg: string;
  onMessage(event: WebViewMessageEvent): void;
  views: Record<string, WebViewHandle | null>;
} | null>(null);

// One tab's screen: a WebView on its path. Each tab keeps its own history and scroll, like native
// stacks. The page runs under the glass bar; automatic insets keep its last row scrollable above it.
export function Page() {
  const shell = use(Shell)!;
  const { name } = useRoute();
  const tab = tabs.find((t) => t.name === name)!;
  const top = useSafeAreaInsets().top;
  const seen = useRef(false);
  useFocusEffect(
    useCallback(() => {
      // The cart page is server-rendered; adds from the Store tab happened in another WebView.
      // A page-side reload, not WebView.reload(): that one shows the library's white loading view.
      if (name === "cart" && seen.current) shell.views.cart?.injectJavaScript("location.reload();true;");
      seen.current = true;
    }, [name, shell]),
  );
  return (
    <View style={{ flex: 1, paddingTop: top, backgroundColor: shell.bg }}>
      <WebView
        ref={(view) => {
          shell.views[name] = view;
        }}
        // The page paints its own theme through prefers-color-scheme; this only covers the frames
        // before the first paint, which would otherwise flash white in dark mode.
        style={{ flex: 1, backgroundColor: shell.bg }}
        source={{ uri: `${ORIGIN}${tab.path}` }}
        applicationNameForUserAgent={SHELL_UA}
        allowsBackForwardNavigationGestures
        contentInsetAdjustmentBehavior="automatic"
        onMessage={shell.onMessage}
        // Anything off-origin would leave the product; keep it inside the shell's one domain.
        // Compare origins, not prefixes: a startsWith check also matches look-alike hosts.
        onShouldStartLoadWithRequest={(req) => new URL(req.url).origin === ORIGIN}
      />
    </View>
  );
}

export default function ShellLayout() {
  const scheme = useColorScheme() === "dark" ? "dark" : "light";
  const theme = themes[scheme];
  const router = useRouter();
  const pathname = usePathname();
  const [signedIn, setSignedIn] = useState(false);
  const [cartCount, setCartCount] = useState(0);
  const knownSession = useRef<boolean | null>(null);
  const returnTo = useRef<string | null>(null);
  const goTo = useRef<string | null>(null);
  const views = useRef<Record<string, WebViewHandle | null>>({});
  const [locked, setLocked] = useState(false);
  // Set on launch and on every trip to the background; the next known session decides. A guest has
  // nothing to protect, and a sign-in that just happened was itself Face ID, so neither locks.
  const needsUnlock = useRef(true);

  async function unlock() {
    const result = await LocalAuthentication.authenticateAsync({ promptMessage: "Unlock RSC Shell" });
    if (result.success) setLocked(false);
  }

  async function lock() {
    // Cover the screen first, then ask. No Face ID or fingerprint enrolled: nothing to unlock with.
    setLocked(true);
    if (!(await LocalAuthentication.isEnrolledAsync())) return setLocked(false);
    await unlock();
  }

  // The page gets the photo as an event, not the shell an API: the search endpoint, its session and
  // its result page stay in the store vertical and change without an app release.
  async function photoSearch() {
    let picked: ImagePicker.ImagePickerResult;
    try {
      if (!(await ImagePicker.requestCameraPermissionsAsync()).granted) return;
      picked = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"] });
    } catch {
      // ponytail: the simulator has no camera, so the photo library stands in there.
      picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"] });
    }
    if (picked.canceled) return;
    // 768 px is plenty to tell six products apart and keeps the upload near 100 KB.
    const image = await ImageManipulator.manipulate(picked.assets[0].uri).resize({ width: 768 }).renderAsync();
    const { base64 } = await image.saveAsync({ compress: 0.6, format: SaveFormat.JPEG, base64: true });
    views.current.store?.injectJavaScript(`dispatchEvent(new CustomEvent("shell:photo",{detail:${JSON.stringify(base64)}}));true;`);
  }

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      // ponytail: locks on every return; add a grace period if quick app switches get annoying.
      if (state === "background") needsUnlock.current = true;
      else if (state === "active" && needsUnlock.current && knownSession.current !== null) {
        needsUnlock.current = false;
        if (knownSession.current) lock();
      }
    });
    return () => sub.remove();
  }, []);

  // A tab that just appeared can only be selected after the render that adds it.
  useEffect(() => {
    if (goTo.current) router.navigate(goTo.current);
    goTo.current = null;
  }, [signedIn]);

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
      returnTo.current = pathname;
      router.navigate("/signin");
    }
    if (msg.type === "session") {
      if (needsUnlock.current) {
        needsUnlock.current = false;
        if (msg.signedIn) lock();
      }
      const flipped = knownSession.current !== null && knownSession.current !== msg.signedIn;
      knownSession.current = msg.signedIn;
      // NativeTabs remounts its tab view whenever the set of visible tabs changes, so a session flip
      // reloads every tab and no page keeps rendering the old session. On a signed-in launch that is
      // one extra load of the open tab, behind the Face ID lock.
      setSignedIn(msg.signedIn);
      if (flipped) {
        goTo.current = (msg.signedIn && returnTo.current) || "/store";
        returnTo.current = null;
      }
    }
  }

  return (
    <ThemeProvider value={scheme === "dark" ? DarkTheme : DefaultTheme}>
      <StatusBar style="auto" />
      <Shell value={{ bg: theme.bg, onMessage, views: views.current }}>
        {/* ponytail: no minimizeBehavior. The bar shrinks on scroll only when UIKit finds the tab's
          scroll view, and it does not look inside a WKWebView; a native scroll-view marker would. */}
        <NativeTabs tintColor={tint}>
          {/* The camera is the tab bar's accessory, glass above the bar. ponytail: iOS 26+ only; on
            older systems the Store tab has no camera. */}
          {signedIn && pathname === "/store" && (
            <NativeTabs.BottomAccessory>
              <Pressable onPress={photoSearch} accessibilityLabel="Search with a photo" style={styles.accessory}>
                <Ionicons name="camera-outline" size={20} color={theme.active} />
                <Text style={{ color: theme.active, fontSize: 15 }}>Search with a photo</Text>
              </Pressable>
            </NativeTabs.BottomAccessory>
          )}
          {tabs.map((tab) => (
            <NativeTabs.Trigger key={tab.name} name={tab.name} hidden={tab.auth !== undefined && tab.auth !== signedIn}>
              <NativeTabs.Trigger.Icon {...tab.icon} />
              <NativeTabs.Trigger.Label>{tab.label}</NativeTabs.Trigger.Label>
              {tab.name === "cart" && cartCount > 0 && <NativeTabs.Trigger.Badge>{String(cartCount)}</NativeTabs.Trigger.Badge>}
            </NativeTabs.Trigger>
          ))}
        </NativeTabs>
      </Shell>
      {locked && (
        <View style={[StyleSheet.absoluteFill, styles.lock, { backgroundColor: theme.bg }]}>
          <Ionicons name="lock-closed-outline" size={40} color={theme.active} />
          <Text style={[styles.lockTitle, { color: theme.active }]}>RSC Shell is locked</Text>
          <Pressable onPress={unlock} style={[styles.lockButton, { borderColor: theme.active }]}>
            <Text style={{ color: theme.active }}>{Platform.OS === "ios" ? "Unlock with Face ID" : "Unlock"}</Text>
          </Pressable>
        </View>
      )}
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  accessory: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  lock: { alignItems: "center", justifyContent: "center", gap: 16 },
  lockTitle: { fontSize: 17, fontWeight: "600" },
  lockButton: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 10 },
});
