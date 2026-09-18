import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { JSDOM } from "jsdom";
import { buildPreview } from "./build-preview.mjs";

async function setup(t) {
  const dom = new JSDOM(await buildPreview(), { runScripts: "outside-only" });
  t.after(() => dom.window.close());
  const w = dom.window;
  const q = (selector) => w.document.querySelector(selector);
  w.HTMLElement.prototype.scrollIntoView = function () {};
  w.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  w.HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  const calls = [];
  Object.defineProperty(w.navigator, "clipboard", {
    get() {
      calls.push("clipboard");
      throw new Error("Preview cannot access clipboard");
    },
  });
  w.fetch = () => {
    calls.push("network");
    throw new Error("Preview cannot access network");
  };
  const script = q("script").textContent;
  const hash = createHash("sha256").update(script).digest("base64");
  assert.ok(
    q('meta[http-equiv="Content-Security-Policy"]').content.includes(
      `script-src 'sha256-${hash}'`,
    ),
  );
  w.eval(script);
  t.after(() => assert.deepEqual(calls, []));
  return { w, q, rows: () => [...w.document.querySelectorAll(".row")] };
}

test("exported preview adds and removes rows using shipped interactions", async (t) => {
  const { w, q, rows } = await setup(t);
  assert.equal(rows().length, 1);
  assert.equal(q(".remove").hidden, true);
  q(".add").click();
  rows()[1].querySelector(".add").click();
  assert.equal(rows().length, 3);
  for (const row of rows()) {
    assert.equal(row.querySelector(".remove").hidden, false);
    for (const input of row.querySelectorAll("input")) {
      assert.equal(input.value, "");
      assert.equal(input.readOnly, true);
    }
    assert.equal(row.querySelector(".value").type, "password");
  }
  assert.equal(w.document.activeElement, rows()[2].querySelector(".value"));
  rows()[1].querySelector(".remove").click();
  rows()[1].querySelector(".remove").click();
  assert.equal(rows().length, 1);
  assert.equal(q(".remove").hidden, true);
});

test("preview eye toggles and populated removal honors cancel and confirm", async (t) => {
  const { q, rows } = await setup(t);
  const eye = q(".reveal");
  const initialIcon = eye.innerHTML;
  eye.click();
  assert.equal(q(".value").type, "text");
  assert.equal(eye.getAttribute("aria-pressed"), "true");
  assert.notEqual(eye.innerHTML, initialIcon);
  eye.click();
  assert.equal(q(".value").type, "password");
  assert.equal(eye.innerHTML, initialIcon);
  q(".add").click();
  const second = rows()[1];
  second.querySelector(".value").value = "LOCAL_FAKE_PREVIEW_KEY";
  second.querySelector(".remove").click();
  q("#cancel").click();
  assert.equal(rows().length, 2);
  second.querySelector(".remove").click();
  q("#confirm-do").click();
  assert.equal(rows().length, 1);
});

test("preview cleanup cannot delete and format selection keeps one empty row", async (t) => {
  const { q, rows } = await setup(t);
  q('input[value="yaml"]').click();
  assert.equal(q('input[name="format"]:checked').value, "yaml");
  assert.equal(rows().length, 1);
  q("#cleanup-cache").click();
  assert.equal(q("#confirm").open, true);
  assert.equal(q("#confirm-do").disabled, true);
  assert.equal(q("#confirm-do").onclick, null);
  q("#cancel").click();
  assert.equal(q("#confirm").open, false);
  q("#read").click();
  q("#generate").click();
  assert.equal(q(".value").value, "");
});

test("capsule and circle styles are present in generated preview", async (t) => {
  const { w, q } = await setup(t);
  const rules = [...w.document.styleSheets[0].cssRules];
  const rule = (selector) =>
    rules.find((item) => item.selectorText === selector).style;
  assert.equal(w.getComputedStyle(q(".value")).borderRadius, "999px");
  assert.equal(rule(".row input").getPropertyValue("height"), "36px");
  assert.equal(
    rule(".row input:focus-visible").getPropertyValue("box-shadow"),
    "0 0 0 1px var(--focus)",
  );
  const circle = rule("button.icon");
  assert.equal(
    circle.getPropertyValue("width"),
    circle.getPropertyValue("height"),
  );
  assert.equal(circle.getPropertyValue("border-radius"), "50%");
  assert.equal(
    rule("button.icon.add").getPropertyValue("border"),
    "1px solid var(--line)",
  );
  const mobile = rules.find(
    (item) => item.conditionText === "(max-width: 430px)",
  );
  const mobileCircle = [...mobile.cssRules].find(
    (item) => item.selectorText === "button.icon",
  ).style;
  assert.equal(
    mobileCircle.getPropertyValue("width"),
    mobileCircle.getPropertyValue("height"),
  );
});
