const fs = require("fs");
const path = require("path");

const cssPath = path.join(__dirname, "..", "public", "css", "styles.css");
const css = fs.readFileSync(cssPath, "utf8");

function lineAt(index) {
  return css.slice(0, index).split(/\r?\n/).length;
}

function findMatchingBrace(source, openIndex) {
  let depth = 0;
  for (let index = openIndex; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function declarations(body) {
  return body
    .split(";")
    .map((part) => {
      const splitAt = part.indexOf(":");
      if (splitAt <= 0) return null;
      const property = part.slice(0, splitAt).trim();
      const value = part.slice(splitAt + 1).trim().replace(/\s+/g, " ");
      return property && value ? { property, value } : null;
    })
    .filter(Boolean);
}

function parseBlocks(segment, context, baseOffset, blocks) {
  let position = 0;
  while (position < segment.length) {
    const openIndex = segment.indexOf("{", position);
    if (openIndex === -1) break;

    const previousClose = segment.lastIndexOf("}", openIndex);
    const preludeStart = Math.max(position, previousClose + 1);
    const prelude = segment.slice(preludeStart, openIndex).trim();
    const closeIndex = findMatchingBrace(segment, openIndex);
    if (closeIndex === -1) break;

    const body = segment.slice(openIndex + 1, closeIndex);
    const absoluteOpenIndex = baseOffset + openIndex;

    if (prelude.startsWith("@")) {
      parseBlocks(body, `${context} > ${prelude}`, baseOffset + openIndex + 1, blocks);
    } else if (prelude && !prelude.includes("{")) {
      prelude
        .split(",")
        .map((selector) => selector.trim())
        .filter(Boolean)
        .forEach((selector) => {
          blocks.push({
            context,
            selector,
            line: lineAt(absoluteOpenIndex),
            declarations: declarations(body),
          });
        });
    }

    position = closeIndex + 1;
  }
}

const blocks = [];
parseBlocks(css, "base", 0, blocks);

const bySelector = new Map();
blocks.forEach((block) => {
  const key = `${block.context}\u0000${block.selector}`;
  if (!bySelector.has(key)) bySelector.set(key, []);
  bySelector.get(key).push(block);
});

const conflicts = [];
bySelector.forEach((selectorBlocks, key) => {
  if (selectorBlocks.length < 2) return;

  const valuesByProperty = new Map();
  selectorBlocks.forEach((block) => {
    block.declarations.forEach(({ property, value }) => {
      if (!valuesByProperty.has(property)) valuesByProperty.set(property, new Map());
      const values = valuesByProperty.get(property);
      if (!values.has(value)) values.set(value, []);
      values.get(value).push(block.line);
    });
  });

  const propertyConflicts = [...valuesByProperty.entries()]
    .filter(([, values]) => values.size > 1)
    .map(([property, values]) => ({
      property,
      values: [...values.entries()].map(([value, lines]) => ({ value, lines })),
    }));

  if (propertyConflicts.length) {
    const [context, selector] = key.split("\u0000");
    conflicts.push({
      context,
      selector,
      lines: selectorBlocks.map((block) => block.line),
      propertyConflicts,
    });
  }
});

if (conflicts.length) {
  console.error("CSS same-context selector conflicts found:");
  conflicts.forEach((conflict) => {
    console.error(`\n${conflict.context} | ${conflict.selector} | lines ${conflict.lines.join(", ")}`);
    conflict.propertyConflicts.forEach((propertyConflict) => {
      const values = propertyConflict.values
        .map(({ value, lines }) => `${propertyConflict.property}: ${value} at ${lines.join("/")}`)
        .join(" | ");
      console.error(`  ${values}`);
    });
  });
  process.exit(1);
}

console.log("CSS conflict check passed.");
