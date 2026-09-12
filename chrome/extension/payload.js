export function serialize(rows, format = "auto") {
  if (!rows.length || rows.some((row) => !row.value))
    throw new Error("请填写每一行的 API Key，或移除空行。");
  const named = rows.some((row) => row.name);
  if (format === "auto") format = named ? "yaml" : "txt";
  if (!["txt", "json", "yaml"].includes(format))
    throw new Error("请选择 TXT、JSON 或 YAML。");
  if (format === "txt") {
    if (named) throw new Error("填写名称后，请选择 JSON 或 YAML 格式。");
    return {
      text: rows.map((row) => row.value).join("\n"),
      filename: "api-key.txt",
    };
  }
  if (!named) {
    const values = rows.map((row) => row.value);
    const quote = (value) =>
      JSON.stringify(value)
        .replace(/\u0085/g, "\\u0085")
        .replace(/\u2028/g, "\\u2028")
        .replace(/\u2029/g, "\\u2029");
    return format === "json"
      ? {
          text: JSON.stringify(
            values.length === 1 ? values[0] : values,
            null,
            2,
          ),
          filename: "api-key.json",
        }
      : {
          text:
            values.length === 1
              ? quote(values[0])
              : values.map((value) => `- ${quote(value)}`).join("\n"),
          filename: "api-key.yaml",
        };
  }
  if (rows.some((row) => !row.name.trim()))
    throw new Error("使用名称时，请为每一行填写名称。");
  if (new Set(rows.map((row) => row.name)).size !== rows.length)
    throw new Error("名称不能重复。");
  if (format === "json")
    return {
      text: JSON.stringify(
        Object.fromEntries(rows.map((row) => [row.name, row.value])),
        null,
        2,
      ),
      filename: "api-key.json",
    };
  // JSON quoting is valid YAML; escape YAML-specific line break characters too.
  const quote = (text) =>
    JSON.stringify(text)
      .replace(/\u0085/g, "\\u0085")
      .replace(/\u2028/g, "\\u2028")
      .replace(/\u2029/g, "\\u2029");
  return {
    text: rows
      .map((row) => `${quote(row.name)}: ${quote(row.value)}`)
      .join("\n"),
    filename: "api-key.yaml",
  };
}
