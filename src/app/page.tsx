"use client";

import {
  type AnimationEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { AuthForm, AuthMenu, type AuthMode } from "@/components/AuthMenu";
import { ForYou } from "@/components/ForYou";
import { GarmentCard } from "@/components/GarmentCard";
import { MainMenu, type MenuView } from "@/components/MainMenu";
import { HistoryPanel } from "@/components/HistoryPanel";
import { WishlistPanel } from "@/components/WishlistPanel";
import { SEARCH_QUERY_MAX } from "@/lib/search";
import { TasteSetup } from "@/components/TasteSetup";
import type { IdentificationRecord, TasteProfile, User } from "@/lib/types";

/**
 * What you asked with. Nesting the variant instead of making `Entry` itself a
 * union keeps every `{ ...entry, status }` update a plain object spread.
 */
type Prompt =
  | { kind: "photo"; previewUrl: string; fileName: string }
  | { kind: "search"; query: string };

/**
 * One question and the answer to it — the only one on screen at a time.
 *
 * Asking again replaces this rather than stacking under it. A thread of past
 * answers reads like a transcript, but nobody comes back to the home page to
 * re-read the piece they looked up twenty minutes ago; they come to look
 * something else up. History is where the old ones live, and it is a better
 * record than a scrollback because it survives a reload.
 *
 * The `id` is what makes the replacement safe. A slow request that resolves
 * after you have already asked something else finds its entry gone and drops
 * its result, instead of overwriting the answer you are reading.
 */
type Entry = {
  id: string;
  prompt: Prompt;
  status: "pending" | "done" | "error";
  record?: IdentificationRecord;
  error?: string;
};

/**
 * `home` is the question the app exists to answer — the photo and search bars,
 * and the answer to the last thing you asked. It is what both doors open onto:
 * the cover's one button, and the house in the header.
 *
 * The For You feed is not a view of its own. It lives at the foot of `home`,
 * under the prompt, where it fills a screen that was otherwise one heading and
 * a lot of nothing. That also puts it in the one place it makes sense: the
 * question comes first, and the suggestions are what to read if you have not
 * got one. `setup` is the questionnaire behind the feed, a screen rather than a
 * modal because it is long enough to scroll.
 */
type View = "home" | "history" | "wishlist" | "setup";

/** Everything the three-bar menu can reach, which is every view but `home`. */
function isMenuView(view: View): view is MenuView {
  return view === "history" || view === "wishlist";
}

/**
 * The three screens before the screens: the cover, the welcome that asks for an
 * account, and the app itself.
 *
 * `welcome` is skipped for anyone already signed in, and skippable by everyone
 * else. It is there to make the case for an account at the one moment the case
 * is worth making — before you have looked anything up — rather than after,
 * when it would be interrupting.
 */
type Stage = "cover" | "welcome" | "app";

export default function Home() {
  const [answer, setAnswer] = useState<Entry | null>(null);
  const [dragging, setDragging] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [view, setView] = useState<View>("home");
  // The cover is the default because it is the front door, not a preference —
  // there is nothing to restore, so it does not need to survive a reload.
  const [stage, setStage] = useState<Stage>("cover");
  // The trip back out to the cover, which gets the same exit the cover gets on
  // the way in — the transition belongs to the crossing, not to one direction.
  const leavingApp = useExit(useCallback(() => setStage("cover"), []));
  const [loadedTaste, setTaste] = useState<TasteProfile | null>(null);
  /**
   * Scoped to the signed-in account rather than cleared on sign-out. Clearing
   * would mean writing state from inside the effect that watches `user`, which
   * costs an extra render pass; reading it through the identity gets the same
   * guarantee for free — no session can ever see the last one's answers.
   */
  const taste = user ? loadedTaste : null;
  const inputRef = useRef<HTMLInputElement>(null);
  /**
   * The object URL behind the photo currently on screen, if the question was a
   * photo. A ref rather than state because it is a resource to release, not
   * something to render — and dropping the entry that owned it is the last
   * moment anything holds a reference to free it by.
   */
  const preview = useRef<string | null>(null);

  /**
   * The profile follows the identity, not the page. Signing in has to bring a
   * feed with it, and signing out has to take one away — leaving a stale
   * profile behind would show one wearer's recommendations to the next.
   *
   * An account with no answers yet lands on the setup screen. That catches the
   * sign-up it was written for, and also the wearer who skipped it last time,
   * which a hook on the registration call alone would miss.
   */
  useEffect(() => {
    if (!user) return;

    let current = true;
    fetch("/api/profile")
      .then((r) => r.json())
      .then((d) => {
        if (!current) return;
        setTaste(d.taste);
        if (!d.taste) setView("setup");
      })
      .catch(() => {});

    return () => {
      current = false;
    };
  }, [user]);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setUser(d.user))
      .catch(() => setUser(null));
  }, []);

  /**
   * Ends the session and puts you back on the home page, which is the one
   * screen that still works without an account. Staying put would leave you
   * looking at a feed or a history that can no longer be loaded.
   */
  const signOut = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    setView("home");
  }, []);

  /**
   * A photo and a typed search are the same interaction with different input:
   * put a pending entry on screen in place of whatever was there, wait, then
   * fill it in. Only the request differs, so only the request is passed in.
   */
  const ask = useCallback(async (prompt: Prompt, send: () => Promise<Response>) => {
    const id = crypto.randomUUID();
    // Asking while reading history means you want a new answer, so the result is
    // not buried behind a tab you are not looking at. Asking from the cover
    // skips both doors — you have already said what you came for, and pitching
    // an account at someone mid-question is the worst moment to do it.
    setView("home");
    setStage("app");

    // The answer on its way out takes its preview with it. Done before the
    // state change rather than in a cleanup, because this is the last line that
    // still knows which URL is being orphaned.
    if (preview.current) URL.revokeObjectURL(preview.current);
    preview.current = prompt.kind === "photo" ? prompt.previewUrl : null;

    setAnswer({ id, prompt, status: "pending" });
    // The answer just replaced may have been long enough to have been scrolled
    // through. The new one begins at the top and should be met there.
    window.scrollTo({ top: 0, behavior: "smooth" });

    // A reply is only still wanted if nothing has been asked since it was sent.
    // Checking the id makes a slow request that lands late harmless: it finds
    // the screen has moved on and quietly drops what it came back with.
    const settle = (resolve: (entry: Entry) => Entry) =>
      setAnswer((prev) => (prev?.id === id ? resolve(prev) : prev));

    try {
      const res = await send();
      const data = await res.json();
      settle((entry) =>
        res.ok
          ? { ...entry, status: "done", record: data.record }
          : { ...entry, status: "error", error: data.error },
      );
    } catch {
      settle((entry) => ({
        ...entry,
        status: "error",
        error: "Network request failed.",
      }));
    }
  }, []);

  const identify = useCallback(
    (file: File) => {
      const body = new FormData();
      body.append("image", file);
      return ask(
        {
          kind: "photo",
          previewUrl: URL.createObjectURL(file),
          fileName: file.name,
        },
        () => fetch("/api/identify", { method: "POST", body }),
      );
    },
    [ask],
  );

  const search = useCallback(
    (query: string) =>
      ask({ kind: "search", query }, () =>
        fetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query }),
        }),
      ),
    [ask],
  );

  // Pasting a screenshot is the fastest path from "saw a fit online" to a result.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const file = Array.from(event.clipboardData?.files ?? []).find((f) =>
        f.type.startsWith("image/"),
      );
      if (file) identify(file);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [identify]);

  const onDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setDragging(false);
    const file = Array.from(event.dataTransfer.files).find((f) =>
      f.type.startsWith("image/"),
    );
    if (file) identify(file);
  };

  return (
    <div
      className="flex min-h-dvh flex-col"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      {stage === "cover" ? (
        // Where to go next is decided when the cover has finished leaving
        // rather than when it was clicked, which quietly buys the session
        // lookup the length of the animation to come back in.
        <Intro onEnter={() => setStage(user ? "app" : "welcome")} />
      ) : stage === "welcome" ? (
        <Welcome onUser={setUser} onDone={() => setStage("app")} />
      ) : (
        <>
          <header
            className={`slab-bar sticky top-0 z-10 flex items-center justify-between border-b border-line px-6 py-4 backdrop-blur-md ${
              leavingApp.exiting ? "view-leaving" : "enter-fade"
            }`}
          >
            <div className="flex items-baseline gap-3">
              {/* The wordmark is the way back to the cover. Results are kept
                  rather than cleared — going back to the front door should not
                  cost you the piece you just looked up. */}
              <button
                type="button"
                onClick={leavingApp.start}
                aria-label="Back to the cover"
                className="text-lg font-medium tracking-tight transition-colors hover:text-accent"
              >
                TwoTone
              </button>
              <span className="hidden text-xs text-muted sm:inline">
                Identify any garment from a name or a photo
              </span>
            </div>

            <div className="flex items-center gap-3">
              {/* Signed in it is the house and the menu and nothing else: two
                  marks of the same size, one for where you land and one for
                  everywhere else. Signed out there is only the way in. */}
              {user ? (
                <>
                  <button
                    type="button"
                    onClick={() => setView("home")}
                    aria-label="Home"
                    aria-current={view === "home" ? "page" : undefined}
                    className={`flex size-9 items-center justify-center rounded-full border transition ${
                      view === "home"
                        ? "border-accent bg-accent text-background"
                        : "border-line text-muted hover:border-accent hover:text-accent"
                    }`}
                  >
                    <HouseMark />
                  </button>

                  <MainMenu
                    email={user.displayName ?? user.email}
                    active={isMenuView(view) ? view : null}
                    onSelect={setView}
                    onSignOut={signOut}
                  />
                </>
              ) : (
                <AuthMenu onUser={setUser} />
              )}
            </div>
          </header>

          <main
            className={`mx-auto w-full max-w-2xl flex-1 px-6 py-10 ${
              leavingApp.exiting ? "view-leaving" : ""
            }`}
            onAnimationEnd={leavingApp.onAnimationEnd}
          >
            {/* Keyed by view so switching tabs remounts the panel and replays
                the arrival. Without the key React would reuse this subtree and
                the new panel would simply appear, which is the one screen
                change in the app that would not be animated. */}
            <div key={view} className="enter-rise">
              {view === "history" ? (
              <HistoryPanel />
            ) : view === "wishlist" ? (
              <WishlistPanel />
            ) : view === "setup" ? (
              <TasteSetup
                existing={taste}
                onSaved={(next) => {
                  setTaste(next);
                  // Home is where the answers show up, at the foot of the page
                  // under the prompt, so saving lands there rather than leaving
                  // someone wondering what the questions just did.
                  setView("home");
                }}
                onSkip={() => setView("home")}
              />
            ) : answer === null ? (
              // The question first, the same whether or not you are signed in,
              // then the feed underneath for anyone who has an account to build
              // one from. Signed out it is left off rather than rendered empty:
              // the endpoint would only answer 401, and a heading followed by
              // nothing is worse than the space it was filling.
              <>
                <Empty
                  onPick={() => inputRef.current?.click()}
                  signedIn={!!user}
                />
                {user && (
                  <div className="mt-4 border-t border-line pt-10">
                    <ForYou onOpen={search} onSetup={() => setView("setup")} />
                  </div>
                )}
              </>
            ) : (
              <section className="space-y-4">
                {/* What you asked, echoed back on the right, so the answer
                    below it reads as a reply to something and not as a page
                    that arrived on its own. */}
                <div className="flex justify-end">
                  {answer.prompt.kind === "photo" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={answer.prompt.previewUrl}
                      alt={answer.prompt.fileName}
                      className="max-h-64 rounded-2xl border border-line object-contain"
                    />
                  ) : (
                    <p className="max-w-md rounded-2xl border border-line px-4 py-2.5 text-sm break-words">
                      {answer.prompt.query}
                    </p>
                  )}
                </div>
                {answer.status === "pending" && <Thinking />}
                {answer.status === "error" && (
                  <p className="slab-card rounded-2xl p-5 text-sm text-muted">
                    {answer.error}
                  </p>
                )}
                {/* Saving needs somewhere for the piece to be saved *to*, and
                    a signed-out search is never written to history — so the
                    control is offered only when there is an account behind it. */}
                {answer.record && (
                  <GarmentCard record={answer.record} canSave={!!user} />
                )}
              </section>
              )}
            </div>
          </main>

          <footer
            className={`slab-bar sticky bottom-0 border-t border-line px-6 py-4 backdrop-blur-md ${
              leavingApp.exiting ? "view-leaving" : "enter-fade"
            }`}
          >
            <SearchBar
              onSearch={search}
              onPickPhoto={() => inputRef.current?.click()}
            />
          </footer>
        </>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) identify(file);
          e.target.value = "";
        }}
      />

      {dragging && (
        <div className="pointer-events-none fixed inset-4 z-20 flex items-center justify-center rounded-3xl border-2 border-dashed border-accent bg-background/70 text-sm tracking-widest text-accent uppercase">
          Drop to identify
        </div>
      )}
    </div>
  );
}

/**
 * The house, drawn rather than imported.
 *
 * An icon set would be several hundred kilobytes of dependency for one glyph,
 * and a character from an emoji font would render differently on every
 * platform. `currentColor` is what matters here: the mark has to invert with
 * the button when the home page is the one you are on.
 */
function HouseMark() {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 7 8 2.2 14 7" />
      <path d="M3.4 6.2V13.4h9.2V6.2" />
      <path d="M6.4 13.4V9.2h3.2v4.2" />
    </svg>
  );
}

/**
 * Plays a screen's exit animation and then does the thing the click asked for.
 *
 * The handover is driven by `animationend` rather than a matching timeout, so
 * the duration lives once in the stylesheet and cannot drift away from a copy
 * of itself in here.
 *
 * Returns `exiting` for the class, `start` for the click, and the handler to
 * spread onto whichever element carries the animation.
 */
function useExit(onDone: () => void) {
  const [exiting, setExiting] = useState(false);
  const fallback = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Held in a ref so the callbacks below never close over a stale `onDone`
  // while an exit is mid-flight. Synced in an effect rather than during render,
  // because a ref written while rendering is read back inconsistently.
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });

  const finish = useCallback(() => {
    if (fallback.current) clearTimeout(fallback.current);
    fallback.current = null;
    // Cleared even though the screen is usually about to unmount: going back
    // to the cover leaves this hook mounted, and a stuck `exiting` would make
    // the app render invisible the next time it opened.
    setExiting(false);
    done.current();
  }, []);

  useEffect(() => {
    return () => {
      if (fallback.current) clearTimeout(fallback.current);
    };
  }, []);

  const start = useCallback(() => {
    if (exiting) return;

    // Asked at click time rather than read from CSS, because the swap is driven
    // by `animationend`: a media query that turned the animation off would
    // leave the event unfired and the button inert. These users skip straight
    // through instead.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      done.current();
      return;
    }

    setExiting(true);
    // A button that silently does nothing is the worst failure here, and there
    // is a real way to get one: a backgrounded tab pauses CSS animations, so
    // `animationend` never arrives. Comfortably longer than the 240ms exit,
    // short enough that nobody clicks twice.
    fallback.current = setTimeout(finish, 600);
  }, [exiting, finish]);

  const onAnimationEnd = useCallback(
    (e: AnimationEvent<HTMLElement>) => {
      // Guarded against animations bubbling up from inside — the wordmark spins
      // forever and never ends, but the next thing added might.
      if (exiting && e.target === e.currentTarget) finish();
    },
    [exiting, finish],
  );

  return { exiting, start, onAnimationEnd };
}

/**
 * The front door. It holds the name and exactly one way forward — no nav, no
 * sign-in, no upload control. The app's whole proposition is "show me a piece",
 * and that lands harder after a beat of nothing than it would as one more
 * button competing in a toolbar.
 *
 * Dropping or pasting a photo here still works and goes straight through,
 * skipping the welcome screen as well.
 */
function Intro({ onEnter }: { onEnter: () => void }) {
  const { exiting, start, onAnimationEnd } = useExit(onEnter);

  return (
    <div
      className={`flex flex-1 flex-col items-center justify-center px-6 text-center ${
        exiting ? "view-leaving" : "enter-fade"
      }`}
      onAnimationEnd={onAnimationEnd}
    >
      <Wordmark />

      <button
        type="button"
        onClick={start}
        className="group mt-12 border border-line px-7 py-3.5 transition-colors hover:border-accent hover:bg-accent"
      >
        {/* Square corners, where every other control in the app is a pill. The
            cover has one thing to press and no siblings to match, so the box
            can afford to be the hard-edged one. */}
        <span className="text-xs tracking-[0.2em] text-accent uppercase transition-colors group-hover:text-background sm:text-sm">
          Curate your Couture
        </span>
      </button>
    </div>
  );
}

/**
 * The welcome screen: what an account is for, and the two ways to get one.
 *
 * It states the case before the buttons rather than after, because the buttons
 * are meaningless until you know what they buy — and what they buy is only
 * history and the wishlist. Identifying a piece has never needed an account,
 * so this offers a way past it rather than pretending otherwise. A wall here
 * would be asking people to register before they have seen the app work.
 *
 * Both ways out — signed in, or straight past — leave through the same exit as
 * every other screen change.
 */
function Welcome({
  onUser,
  onDone,
}: {
  onUser: (user: User) => void;
  onDone: () => void;
}) {
  // Null while the choice is still open, then the side the pressed button
  // named. The form can still switch once it is up; this only decides which
  // way it opens.
  const [mode, setMode] = useState<AuthMode | null>(null);
  const { exiting, start, onAnimationEnd } = useExit(onDone);

  return (
    <div
      className={`flex flex-1 flex-col items-center justify-center px-6 py-16 ${
        exiting ? "view-leaving" : "enter-fade"
      }`}
      onAnimationEnd={onAnimationEnd}
    >
      <div className="w-full max-w-sm">
        <div className="text-center">
          <p className="archive-label">Before you start</p>
          <h1 className="mt-3 text-2xl leading-tight font-medium tracking-tight text-balance">
            An account keeps what you find
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted text-balance">
            With one, every piece you look up sticks around and you can start a
            WishList. Without one TwoTone still answers, it just forgets the
            second you leave.
          </p>
        </div>

        {mode === null ? (
          <div className="mt-8 space-y-3">
            {/* Filled against outlined: creating an account is the one this
                screen exists to recommend, and signing in is for people who
                already decided. */}
            <button
              type="button"
              onClick={() => setMode("register")}
              className="w-full rounded-full border border-accent bg-accent px-6 py-3 text-sm text-background transition hover:bg-transparent hover:text-accent"
            >
              Create an account
            </button>
            <button
              type="button"
              onClick={() => setMode("login")}
              className="w-full rounded-full border border-line px-6 py-3 text-sm transition hover:border-accent hover:text-accent"
            >
              Sign in
            </button>
          </div>
        ) : (
          <AuthForm
            initialMode={mode}
            className="mt-8 w-full"
            onClose={() => setMode(null)}
            // The session is handed up before the exit rather than after, so
            // the app behind this screen is already signed in by the time it
            // is uncovered — no flash of the signed-out header.
            onSignedIn={(user) => {
              onUser(user);
              start();
            }}
          />
        )}

        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={start}
            className="text-xs text-muted transition-colors hover:text-accent"
          >
            Continue without an account
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * How many copies of the word are stacked to build its depth.
 *
 * Under about ten the extrusion shows as separate slices rather than a solid
 * flank, because each copy has to sit far enough back to cover the gap to the
 * next. Past twenty the added copies are invisible and only cost paint.
 */
const WORDMARK_DEPTH = 16;

/** The gap between copies, in em so the depth scales with the type size. */
const WORDMARK_STEP = 0.02;

function Wordmark() {
  return (
    <div className="wordmark-3d">
      <div className="wordmark-3d__tilt">
        <h1 className="wordmark-3d__spin text-6xl leading-none font-medium tracking-tight sm:text-8xl">
          {Array.from({ length: WORDMARK_DEPTH }, (_, layer) => (
            <span
              key={layer}
              // Only the first copy is the heading; the other fifteen are the
              // object's thickness and would otherwise be read aloud as
              // sixteen consecutive "TwoTone"s.
              aria-hidden={layer > 0 || undefined}
              className="wordmark-3d__layer"
              style={{
                transform: `translateZ(${-layer * WORDMARK_STEP}em)`,
                // Both faces are black and the flank between them is the
                // border tone, so the word reads as a solid slab from either
                // side instead of turning inside-out halfway through the
                // rotation. The flank has to stay well clear of the backdrop's
                // value or the depth turns to haze over the lighter passages
                // of the hide — it is carrying the whole illusion.
                color:
                  layer === 0 || layer === WORDMARK_DEPTH - 1
                    ? "var(--foreground)"
                    : "var(--line)",
              }}
            >
              TwoTone
            </span>
          ))}
        </h1>
      </div>
    </div>
  );
}

/**
 * Holds its own text so a keystroke re-renders the bar and not the whole
 * thread above it — every result card would otherwise re-render on each letter.
 *
 * Photo keeps a button here because the bar used to be the only way to pick a
 * file by clicking. Drag and paste still work anywhere on the page, but once
 * there are results the empty state's "Choose a photo" is gone, and without
 * this there would be no visible way to upload one at all.
 */
function SearchBar({
  onSearch,
  onPickPhoto,
}: {
  onSearch: (query: string) => void;
  onPickPhoto: () => void;
}) {
  const [query, setQuery] = useState("");
  const trimmed = query.trim();

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!trimmed) return;
        onSearch(trimmed);
        // Cleared because the query is echoed into the thread the moment it is
        // sent — leaving it here would show the same words twice.
        setQuery("");
      }}
      className="mx-auto flex max-w-2xl items-center gap-2"
    >
      <button
        type="button"
        onClick={onPickPhoto}
        className="shrink-0 rounded-full border border-line px-4 py-3 text-sm text-muted transition hover:border-accent hover:text-accent"
      >
        Photo
      </button>

      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        maxLength={SEARCH_QUERY_MAX}
        placeholder="Search any piece — name it, or describe it"
        aria-label="Search for a garment"
        className="min-w-0 flex-1 rounded-full border border-line bg-transparent px-5 py-3 text-sm placeholder:text-muted focus:border-accent focus:outline-none"
      />

      <button
        type="submit"
        disabled={!trimmed}
        className="shrink-0 rounded-full border border-accent px-5 py-3 text-sm text-accent transition hover:bg-accent hover:text-background disabled:border-line disabled:text-muted disabled:hover:bg-transparent disabled:hover:text-muted"
      >
        Search
      </button>
    </form>
  );
}

function Empty({
  onPick,
  signedIn,
}: {
  onPick: () => void;
  signedIn: boolean;
}) {
  return (
    // Roomier above than below, because below there is now a feed on most
    // visits and the gap to it should read as a seam, not a second screen.
    <div className="flex flex-col items-center pt-20 pb-12 text-center">
      <h1 className="max-w-md text-3xl leading-tight font-medium tracking-tight text-balance">
        What is that piece?
      </h1>
      <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted">
        Search for any garment by name, or drop in a photo of one. TwoTone works
        out the brand, the year it was made, whether it is still in production,
        and where to find it new or secondhand.
      </p>
      <button
        type="button"
        onClick={onPick}
        className="mt-8 rounded-full border border-accent px-6 py-2.5 text-sm text-accent transition hover:bg-accent hover:text-background"
      >
        Choose a photo
      </button>
      {/* Say it before the upload, not after — someone identifying a piece they
          care about should know it is not being kept. */}
      {!signedIn && (
        <p className="mt-6 max-w-xs text-xs leading-relaxed text-muted">
          Signed out, your photo is read once and never stored. Sign in to keep
          a history of what you have identified.
        </p>
      )}
    </div>
  );
}

function Thinking() {
  return (
    <div className="slab-card flex items-center gap-3 rounded-2xl p-5">
      <span className="size-2 animate-pulse rounded-full bg-accent" />
      <span className="text-sm text-muted">Reading the details…</span>
    </div>
  );
}
