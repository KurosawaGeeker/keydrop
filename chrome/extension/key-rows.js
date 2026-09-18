// Shared field interactions for the extension and the offline preview.
// Keep this factory self-contained so the preview can embed it without imports.
export function createKeyRows({
  container,
  template,
  icons,
  onChange,
  onActive,
  confirmRemove,
  readOnly = false,
}) {
  const rows = () => [...container.children];
  function changed() {
    const current = rows();
    for (const row of current)
      row.querySelector(".remove").hidden = current.length === 1;
    onChange();
  }
  function activate(value) {
    onActive(value);
    value.focus();
  }
  function addRow(after) {
    const row = template.content.firstElementChild.cloneNode(true);
    for (const element of row.querySelectorAll("[data-icon]"))
      element.innerHTML = icons[element.dataset.icon];
    for (const input of row.querySelectorAll("input"))
      input.readOnly = readOnly;
    if (after) after.after(row);
    else container.append(row);
    const value = row.querySelector(".value");
    row.addEventListener("focusin", () => onActive(value));
    row.addEventListener("input", onChange);
    row.querySelector(".reveal").onclick = (event) => {
      const visible = value.type === "password";
      value.type = visible ? "text" : "password";
      const button = event.currentTarget;
      button.title = visible ? "隐藏 API Key" : "显示 API Key";
      button.setAttribute("aria-label", button.title);
      button.setAttribute("aria-pressed", String(visible));
      button.innerHTML = icons[visible ? "eye-off" : "eye"];
    };
    row.querySelector(".add").onclick = () => addRow(row);
    row.querySelector(".remove").onclick = () => {
      const remove = () => {
        if (rows().length <= 1) return;
        row.remove();
        changed();
        activate(rows()[0].querySelector(".value"));
      };
      if (value.value || row.querySelector(".name").value)
        confirmRemove(remove);
      else remove();
    };
    changed();
    activate(value);
    row.scrollIntoView({ block: "nearest" });
  }
  return { addRow };
}
