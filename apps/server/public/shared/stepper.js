// Replaces a small <select> or number input with big − / + buttons. The original
// control stays in the DOM, hidden, so existing code keeps reading and writing it.
const RESOURCE_ICONS = new Set(["wood", "brick", "sheep", "wheat", "ore"]);

function limitOf(control) {
  if (control.tagName === "SELECT") {
    return Math.max(0, ...Array.from(control.options, (o) => Number(o.value) || 0));
  }
  const max = Number(control.max);
  return control.max !== "" && Number.isFinite(max) ? max : Infinity;
}

function enhance(control, resource) {
  const stepper = document.createElement("div");
  stepper.className = "stepper";
  stepper.dataset.resource = resource;
  const label = resource[0].toUpperCase() + resource.slice(1);
  stepper.innerHTML = `
    <img class="stepperIcon" src="/shared/icons/${resource}.png" alt="${label}" />
    <button type="button" class="stepperBtn" data-step="-1" aria-label="Less ${resource}">−</button>
    <span class="stepperValue" aria-live="polite">0</span>
    <button type="button" class="stepperBtn" data-step="1" aria-label="More ${resource}">+</button>
  `;
  const [minus, plus] = stepper.querySelectorAll(".stepperBtn");
  const valueEl = stepper.querySelector(".stepperValue");

  const sync = () => {
    const value = Number(control.value) || 0;
    valueEl.textContent = String(value);
    stepper.classList.toggle("active", value > 0);
    stepper.classList.toggle("disabled", control.disabled);
    minus.disabled = control.disabled || value <= 0;
    plus.disabled = control.disabled || value >= limitOf(control);
  };

  // Code elsewhere assigns .value directly, which fires no event.
  const native = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(control), "value");
  Object.defineProperty(control, "value", {
    configurable: true,
    get: () => native.get.call(control),
    set: (next) => {
      native.set.call(control, next);
      sync();
    }
  });
  new MutationObserver(sync).observe(control, {
    attributes: true,
    attributeFilter: ["disabled", "max"],
    childList: true
  });

  stepper.addEventListener("click", (ev) => {
    const step = Number(ev.target.closest?.("[data-step]")?.dataset.step);
    if (!step) return;
    control.value = String((Number(control.value) || 0) + step);
    control.dispatchEvent(new Event("input", { bubbles: true }));
    control.dispatchEvent(new Event("change", { bubbles: true }));
  });

  const field = control.closest(".field");
  field.classList.add("stepperField");
  field.append(stepper);
  sync();
}

// Enhances every resource control inside each .tradeGrid under root.
export function installSteppers(root = document) {
  for (const control of root.querySelectorAll(".tradeGrid select, .tradeGrid input")) {
    const resource = control.id.replace(/^[a-z]+(?:Give|Want|Yop)?(?=[A-Z])/, "").toLowerCase();
    if (RESOURCE_ICONS.has(resource)) enhance(control, resource);
  }
}
