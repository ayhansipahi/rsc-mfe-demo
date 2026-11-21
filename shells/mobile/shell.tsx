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
// app/ holds one directory per tab: a stack layout, the tab's own page, and the page a link pushes.
// Each file re-exports from here.
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import * as LocalAuthentication from "expo-local-authentication";
import { useFocusEffect, useLocalSearchParams, useNavigation, usePathname, useRouter } from "expo-router";
import { DarkTheme, DefaultTheme, StackActions, ThemeProvider, useRoute } from "expo-router/react-navigation";
import { Stack } from "expo-router/stack";
import { NativeTabs, type MaterialIcon, type SFSymbolIcon } from "expo-router/native-tabs";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { createContext, use, useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, BackHandler, DynamicColorIOS, Platform, Pressable, StyleSheet, Text, useColorScheme, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

// The launch screen stays up until the first page has loaded, then fades: launch goes from the mark
// to content with no empty frame between. Here, not in an effect: it has to run before a render.
SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({ fade: true, duration: 250 });

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
  // The route directory under app/.
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
  { name: "(home)", label: "Home", path: "/", icon: { sf: { default: "house", selected: "house.fill" }, md: "home" } },
  { name: "store", label: "Store", path: "/store", icon: { sf: { default: "storefront", selected: "storefront.fill" }, md: "storefront" } },
  { name: "cart", label: "Cart", path: "/store/cart", icon: { sf: { default: "cart", selected: "cart.fill" }, md: "shopping_cart" }, auth: true },
  { name: "orders", label: "Orders", path: "/orders", icon: { sf: { default: "shippingbox", selected: "shippingbox.fill" }, md: "package_2" }, auth: true },
  { name: "account", label: "Account", path: "/account", icon: { sf: { default: "person.crop.circle", selected: "person.crop.circle.fill" }, md: "account_circle" }, auth: true },
  { name: "signin", label: "Sign in", path: "/login?next=/store", icon: { sf: "person.crop.circle", md: "login" }, auth: false },
];

// The tab's route: "/" for the (home) group, "/store" for app/store.
const href = (tab: Tab) => (tab.name === "(home)" ? "/" : `/${tab.name}`);

// The script that takes a tab's WebView back to the tab's own page. Already on it, it runs `there`.
const ownPage = (tab: Tab, there = "0") => {
  const path = JSON.stringify(tab.path);
  return `location.pathname+location.search===${path}?${there}:location.assign(${path});true;`;
};

type ShellMessage =
  | { type: "session"; signedIn: boolean; email?: string }
  | { type: "cart"; count: number }
  | { type: "auth-required" };

interface WebViewHandle {
  injectJavaScript(js: string): void;
  goBack(): void;
  reload(): void;
}

const Shell = createContext<{
  bg: string;
  fg: string;
  signedIn: boolean;
  onMessage(event: WebViewMessageEvent): void;
  open(tab: Tab): void;
  // Each tab's own page, the first screen of its stack, and what pops that stack back to it.
  views: Record<string, WebViewHandle | null>;
  pops: Record<string, (() => void) | null>;
} | null>(null);

// Which tab a screen belongs to. From the tab's layout, not from the URL: every tab's screens stay
// mounted, and the URL only ever names the focused one.
const TabOf = createContext<Tab | null>(null);

// app/<tab>/_layout.tsx. One tab: its own UINavigationController, as a native tab has. A link tapped
// on a page pushes its target as a new screen, so pages slide in, the back button and the edge swipe
// pop them, and tapping the selected tab returns to the tab's own page.
export function TabStack() {
  const shell = use(Shell)!;
  const { name } = useRoute();
  return (
    <TabOf value={tabs.find((t) => t.name === name)!}>
      <Stack
        screenOptions={{
          // The pages carry their own heading, so the bar holds the back button and nothing else.
          title: "",
          headerBackButtonDisplayMode: "minimal",
          headerShadowVisible: false,
          headerStyle: { backgroundColor: shell.bg },
          headerTintColor: shell.fg,
          contentStyle: { backgroundColor: shell.bg },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
      </Stack>
    </TabOf>
  );
}

// Re-exported by every tab layout. A deep link straight to a pushed page still gets the tab's own
// page under it, so the back button and a tab re-tap have somewhere to go.
export const unstable_settings = { anchor: "index" };

// app/<tab>/index.tsx and page.tsx. One screen: a WebView with its own history and scroll, on the
// tab's own page or, as page?path=, on the page a link led to. The page runs under the glass bar;
// automatic insets keep its last row scrollable above it.
export function Page() {
  const shell = use(Shell)!;
  const tab = use(TabOf)!;
  const name = tab.name;
  const root = useRoute().name === "index";
  // A deep link can write this param, so only a path on the origin counts: "@other.host" appended
  // to the origin would name another host.
  const pushed = useLocalSearchParams<{ path?: string | string[] }>().path;
  const path = !root && typeof pushed === "string" && pushed.startsWith("/") ? pushed : tab.path;
  const navigation = useNavigation();
  const router = useRouter();
  const top = useSafeAreaInsets().top;
  const web = useRef<WebViewHandle | null>(null);
  const seen = useRef(false);
  const canGoBack = useRef(false);
  useFocusEffect(
    useCallback(() => {
      // The cart page is server-rendered; adds from the Store tab happened in another WebView.
      // A page-side reload, not WebView.reload(): that one shows the library's white loading view.
      if (root && name === "cart" && seen.current) web.current?.injectJavaScript("location.reload();true;");
      seen.current = true;
      // Android's back walks the page's history first; at its start the system takes over. iOS has
      // the edge swipe on the WebView itself and never fires this.
      const back = BackHandler.addEventListener("hardwareBackPress", () => {
        if (canGoBack.current) web.current?.goBack();
        return canGoBack.current;
      });
      return () => back.remove();
    }, [name, root]),
  );
  return (
    // The tab's own page has no bar, so it clears the status bar itself.
    <View style={{ flex: 1, paddingTop: root ? top : 0, backgroundColor: shell.bg }}>
      <WebView
        ref={(view) => {
          web.current = view;
          if (!root) return;
          shell.views[name] = view;
          shell.pops[name] =
            view &&
            (() => {
              // Only with something pushed: on a bare stack nothing handles the action, which
              // React Navigation reports as an error.
              if ((navigation.getState()?.routes.length ?? 1) > 1) navigation.dispatch(StackActions.popToTop());
            });
        }}
        // The page paints its own theme through prefers-color-scheme; this only covers the frames
        // before the first paint, which would otherwise flash white in dark mode.
        style={{ flex: 1, backgroundColor: shell.bg }}
        source={{ uri: `${ORIGIN}${path}` }}
        applicationNameForUserAgent={SHELL_UA}
        allowsBackForwardNavigationGestures
        // The system refresh control on the page's own scroll view. It reloads natively, so the
        // library's loading view stays out of it. ponytail: iOS only; Android's WebView has no
        // refresh control, and wrapping it in one is its own change.
        pullToRefreshEnabled
        // Not optional: unset, the library hands UIScrollView a rate of 0 and a flick stops dead the
        // moment the finger lifts. This is the rate every native list glides at.
        decelerationRate="normal"
        contentInsetAdjustmentBehavior="automatic"
        onMessage={shell.onMessage}
        onNavigationStateChange={(state) => {
          canGoBack.current = state.canGoBack;
        }}
        // A tab's first load shows the system spinner on the shell's background, and a load that
        // fails shows a screen with a retry: never an empty page, never WebKit's error text.
        startInLoadingState
        renderLoading={() => (
          <View style={[StyleSheet.absoluteFill, styles.cover, { backgroundColor: shell.bg }]}>
            <ActivityIndicator />
          </View>
        )}
        renderError={() => (
          <View style={[StyleSheet.absoluteFill, styles.cover, { backgroundColor: shell.bg }]}>
            <Ionicons name="cloud-offline-outline" size={40} color={shell.fg} />
            <Text style={[styles.coverTitle, { color: shell.fg }]}>Can't load this page</Text>
            <Pressable onPress={() => web.current?.reload()} style={[styles.coverButton, { borderColor: shell.fg }]}>
              <Text style={{ color: shell.fg }}>Try again</Text>
            </Pressable>
          </View>
        )}
        // The retry screen arrives with the system's error tap, as a failed native action does.
        onError={() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)}
        // Fires for a failed load too, so the launch screen never outlives the first answer.
        onLoadEnd={SplashScreen.hide}
        // The bar of arrows and Done that WebKit puts above the keyboard; native forms have none.
        hideKeyboardAccessoryView
        // A long press on a link would lift a preview that opens the page in Safari, outside the app.
        allowsLinkPreview={false}
        onShouldStartLoadWithRequest={(req) => {
          const url = new URL(req.url);
          // Anything off-origin would leave the product; keep it inside the shell's one domain.
          // Compare origins, not prefixes: a startsWith check also matches look-alike hosts.
          if (url.origin !== ORIGIN) return false;
          // Only a tapped link becomes a screen. Redirects, form posts and the page's own
          // location changes stay in this WebView, as does a link to the page itself. Android's
          // WebView does not say what started a navigation, so there every page loads in place.
          const to = url.pathname + url.search;
          if (req.navigationType !== "click" || to === path) return true;
          // Another tab's own page: go to that tab, not to a second copy of it in this one.
          const other = tabs.find((t) => t.path === to && t.name !== name && t.auth !== !shell.signedIn);
          const under = navigation.getState()?.routes.slice(0, -1) ?? [];
          // A link back to a page this stack already holds pops to it. Without its query too:
          // "/login" is the Sign in tab's "/login?next=/store".
          const at = under
            .map((r) => (r.params as { path?: string } | undefined)?.path ?? tab.path)
            .findIndex((p) => p === to || p.split("?")[0] === to);
          if (other) shell.open(other);
          else if (at >= 0) router.dismiss(under.length - at);
          else router.push({ pathname: `${href(tab).replace(/\/$/, "")}/page`, params: { path: to } });
          return false;
        }}
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
  // The cart count last reported inside the current signed-in session; null until there is one.
  const cartSeen = useRef<number | null>(null);
  const returnTo = useRef<string | null>(null);
  const goTo = useRef<string | null>(null);
  const views = useRef<Record<string, WebViewHandle | null>>({});
  const pops = useRef<Record<string, (() => void) | null>>({});
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

  // ponytail: a fixed ceiling on the launch screen. On a slow network the first page can take longer
  // than anyone should look at a logo; after this the tab's own spinner takes over.
  useEffect(() => {
    const timer = setTimeout(SplashScreen.hide, 3000);
    return () => clearTimeout(timer);
  }, []);

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

  // Selects a tab on its own page, as a second tap on its button does: what is pushed in it pops,
  // and a WebView that has wandered (a search, a redirect) goes back to the tab's path. The pop
  // comes first and goes to that tab's own stack: navigate alone pushes a second copy of the tab's
  // page onto a stack that holds pushed screens.
  function open(tab: Tab) {
    views.current[tab.name]?.injectJavaScript(ownPage(tab));
    pops.current[tab.name]?.();
    router.navigate(href(tab));
  }

  function onMessage(event: WebViewMessageEvent) {
    let msg: ShellMessage;
    try {
      msg = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }
    if (msg.type === "cart") {
      // A WebView has no haptics, so the shell gives an add the tap it would get in a native store.
      // An add is a count that rose between two reports of one signed-in session; a launch or a
      // sign-in that finds a full cart is a first report and stays silent. ponytail: inferred from
      // the count; a message of its own is the upgrade once a page wants feedback the shell can't infer.
      if (knownSession.current && cartSeen.current !== null && msg.count > cartSeen.current) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      cartSeen.current = knownSession.current ? msg.count : null;
      setCartCount(msg.count);
    }
    if (msg.type === "auth-required") {
      // A guest tapped something that needs a session: sign in, then come back to this tab.
      // To the tab, not to a page pushed in it: that screen is gone once the tabs remount.
      returnTo.current = pathname.replace(/\/page$/, "") || "/";
      open(tabs.find((t) => t.name === "signin")!);
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
        cartSeen.current = null;
        goTo.current = (msg.signedIn && returnTo.current) || "/store";
        returnTo.current = null;
      }
    }
  }

  return (
    <ThemeProvider value={scheme === "dark" ? DarkTheme : DefaultTheme}>
      <StatusBar style="auto" />
      <Shell value={{ bg: theme.bg, fg: theme.active, signedIn, onMessage, open, views: views.current, pops: pops.current }}>
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
            <NativeTabs.Trigger
              key={tab.name}
              name={tab.name}
              hidden={tab.auth !== undefined && tab.auth !== signedIn}
              // The selected tab tapped again, as on a native tab: off its own page it goes back to
              // it, on it it scrolls to the top. UIKit does neither by itself for a WKWebView. The
              // press is emitted before the tab changes, so focused here means it already was.
              listeners={({ navigation }) => ({
                tabPress: () => {
                  if (!navigation.isFocused()) return;
                  views.current[tab.name]?.injectJavaScript(ownPage(tab, 'scrollTo({top:0,behavior:"smooth"})'));
                },
              })}
            >
              <NativeTabs.Trigger.Icon {...tab.icon} />
              <NativeTabs.Trigger.Label>{tab.label}</NativeTabs.Trigger.Label>
              {tab.name === "cart" && cartCount > 0 && <NativeTabs.Trigger.Badge>{String(cartCount)}</NativeTabs.Trigger.Badge>}
            </NativeTabs.Trigger>
          ))}
        </NativeTabs>
      </Shell>
      {locked && (
        <View style={[StyleSheet.absoluteFill, styles.cover, { backgroundColor: theme.bg }]}>
          <Ionicons name="lock-closed-outline" size={40} color={theme.active} />
          <Text style={[styles.coverTitle, { color: theme.active }]}>RSC Shell is locked</Text>
          <Pressable onPress={unlock} style={[styles.coverButton, { borderColor: theme.active }]}>
            <Text style={{ color: theme.active }}>{Platform.OS === "ios" ? "Unlock with Face ID" : "Unlock"}</Text>
          </Pressable>
        </View>
      )}
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  accessory: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  // A full-screen stand-in for a page: the lock, a first load, a failed load.
  cover: { alignItems: "center", justifyContent: "center", gap: 16 },
  coverTitle: { fontSize: 17, fontWeight: "600" },
  coverButton: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 10 },
});
