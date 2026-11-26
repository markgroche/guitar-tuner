const root = document.documentElement;
const button = document.getElementById("skin-toggle");
const hint = document.getElementById("string-hint");
const settings = document.getElementById("studio-settings");
const title = document.getElementById("version-title");
const themeColor = document.querySelector('meta[name="theme-color"]');

function applySkin(skin, updateUrl = false) {
  const acoustic = skin === "acoustic";
  root.dataset.skin = acoustic ? "acoustic" : "classic";
  button.textContent = acoustic ? "Tuner v1" : "Tuner v2";
  button.setAttribute("aria-label", `Switch to tuner version ${acoustic ? "1" : "2"}`);
  title.replaceChildren(document.createTextNode("Guitar tuner "));
  const version = document.createElement("span");
  version.textContent = acoustic ? "v2" : "v1";
  title.append(version);
  settings.open = !acoustic;
  hint.textContent = acoustic
    ? "Tap a peg to hear it. While listening, tap to lock it."
    : "Tap a string to hear it. While listening, tap to lock it.";
  themeColor.content = acoustic ? "#160e09" : "#101018";
  try {
    if (updateUrl) {
      const url = new URL(location.href);
      url.searchParams.set("v", acoustic ? "2" : "1");
      history.replaceState(null, "", url);
    }
  } catch {}
}

button.addEventListener("click", () => applySkin(root.dataset.skin === "acoustic" ? "classic" : "acoustic", true));
document.addEventListener("click", (event) => {
  if (root.dataset.skin === "acoustic" && settings.open && !settings.contains(event.target)) settings.open = false;
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && root.dataset.skin === "acoustic" && settings.open) {
    settings.open = false;
    settings.querySelector("summary").focus({ preventScroll: true });
  }
});
applySkin(root.dataset.skin === "classic" ? "classic" : "acoustic");
