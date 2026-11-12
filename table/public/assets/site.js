document.documentElement.classList.add("js");

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const nav = document.querySelector(".nav");
const toggle = document.querySelector(".nav-toggle");
const links = document.getElementById("nav-links");

if (nav) {
  const onScroll = () => nav.classList.toggle("is-scrolled", window.scrollY > 8);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });
}

if (toggle && links) {
  const setOpen = (open) => {
    toggle.setAttribute("aria-expanded", String(open));
    links.classList.toggle("is-open", open);
  };
  toggle.addEventListener("click", () => setOpen(toggle.getAttribute("aria-expanded") !== "true"));
  links.addEventListener("click", (event) => {
    if (event.target.closest("a")) setOpen(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setOpen(false);
  });
}

const revealed = document.querySelectorAll(".reveal");
if ("IntersectionObserver" in window && !reduceMotion) {
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add("in");
      observer.unobserve(entry.target);
    }
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.12 });
  revealed.forEach((el) => observer.observe(el));
} else {
  revealed.forEach((el) => el.classList.add("in"));
}

for (const year of document.querySelectorAll("[data-year]")) {
  year.textContent = String(new Date().getFullYear());
}

const stories = document.querySelector("[data-stories]");
if (stories) {
  const steps = [...stories.querySelectorAll(".story-step")];
  const shots = [...stories.querySelectorAll(".story-shot")];
  const notes = [...stories.querySelectorAll(".story-note")];
  const bars = [...stories.querySelectorAll(".story-bars span")];
  const pause = stories.querySelector("[data-story-pause]");
  let current = 0;
  let userPaused = reduceMotion;
  let hovering = false;
  let visible = false;

  if (reduceMotion) stories.classList.add("is-static");

  const syncPause = () => {
    const paused = userPaused || hovering || !visible;
    stories.classList.toggle("is-paused", paused);
    if (pause) {
      pause.setAttribute("aria-pressed", String(userPaused));
      pause.setAttribute("aria-label", userPaused ? "Play the walkthrough" : "Pause the walkthrough");
      pause.querySelector("[data-icon-pause]").hidden = userPaused;
      pause.querySelector("[data-icon-play]").hidden = !userPaused;
    }
  };

  const show = (index) => {
    current = (index + steps.length) % steps.length;
    steps.forEach((step, i) => {
      step.classList.toggle("is-active", i === current);
      if (i === current) step.setAttribute("aria-current", "step");
      else step.removeAttribute("aria-current");
    });
    shots.forEach((shot, i) => shot.classList.toggle("is-active", i === current));
    notes.forEach((note) => note.classList.toggle("is-active", Number(note.dataset.step) === current));
    bars.forEach((bar, i) => {
      bar.classList.toggle("done", i < current);
      bar.classList.remove("active");
    });
    const active = bars[current];
    if (active) {
      void active.offsetWidth;
      active.classList.add("active");
    }
  };

  steps.forEach((step, i) => step.addEventListener("click", () => show(i)));
  bars.forEach((bar) => bar.addEventListener("animationend", () => show(current + 1)));

  const stage = stories.querySelector(".story-stage");
  stage?.addEventListener("click", (event) => {
    const rect = stage.getBoundingClientRect();
    show(event.clientX - rect.left < rect.width / 3 ? current - 1 : current + 1);
  });
  stage?.addEventListener("pointerenter", (event) => {
    if (event.pointerType === "mouse") { hovering = true; syncPause(); }
  });
  stage?.addEventListener("pointerleave", () => { hovering = false; syncPause(); });
  stories.addEventListener("focusin", (event) => {
    if (event.target.matches(":focus-visible")) { hovering = true; syncPause(); }
  });
  stories.addEventListener("focusout", () => { hovering = false; syncPause(); });

  pause?.addEventListener("click", () => {
    userPaused = !userPaused;
    syncPause();
  });

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      syncPause();
    }, { threshold: 0.35 }).observe(stories);
  } else {
    visible = true;
  }

  show(0);
  syncPause();
}

const toc = document.querySelectorAll(".toc a[href^='#']");
if (toc.length && "IntersectionObserver" in window) {
  const byId = new Map([...toc].map((link) => [link.getAttribute("href").slice(1), link]));
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      toc.forEach((link) => link.classList.remove("is-current"));
      byId.get(entry.target.id)?.classList.add("is-current");
    }
  }, { rootMargin: "-20% 0px -70% 0px" });
  byId.forEach((_, id) => {
    const section = document.getElementById(id);
    if (section) observer.observe(section);
  });
}
