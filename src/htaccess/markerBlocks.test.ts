import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  escapeRegex,
  extractMarkerBlock,
  hasMarkerBlock,
  removeMarkerBlock,
  upsertMarkerBlock,
} from "./markerBlocks.js";

const START = "# BEGIN test-extension";
const END = "# END test-extension";

const block = (inner: string) => `${START}\n${inner}\n${END}`;

describe("escapeRegex", () => {
  it("escapes all regex metacharacters", () => {
    const meta = ".*+?^${}()|[]\\";
    const escaped = escapeRegex(meta);
    assert.equal(new RegExp(`^${escaped}$`).test(meta), true);
  });
});

describe("hasMarkerBlock / extractMarkerBlock", () => {
  it("finds a block and extracts its inner content", () => {
    const content = `User-Zeug oben\n${block("Inhalt")}\nUser-Zeug unten`;
    assert.equal(hasMarkerBlock(content, START, END), true);
    assert.equal(extractMarkerBlock(content, START, END), "Inhalt\n");
  });

  it("returns null / false when no block exists", () => {
    assert.equal(hasMarkerBlock("nur User-Inhalt", START, END), false);
    assert.equal(extractMarkerBlock("nur User-Inhalt", START, END), null);
  });

  it("does not mistake a longer marker name for its prefix", () => {
    const other = `# BEGIN test-extension-v2\nfremd\n# END test-extension-v2`;
    assert.equal(hasMarkerBlock(other, START, END), false);
    assert.equal(extractMarkerBlock(other, START, END), null);
  });

  it("recognizes CRLF files and trailing whitespace after markers", () => {
    const content = `${START}  \r\nInhalt\r\n${END}\t\r\n`;
    assert.equal(hasMarkerBlock(content, START, END), true);
    assert.equal(extractMarkerBlock(content, START, END), "Inhalt\r\n");
  });

  it("is not confused by regex metacharacters in markers", () => {
    const start = "# BEGIN ext (v1.2)";
    const end = "# END ext (v1.2)";
    const content = `${start}\nX\n${end}`;
    assert.equal(extractMarkerBlock(content, start, end), "X\n");
  });

  it("matches lazily and keeps sibling blocks apart", () => {
    const content = `${block("A")}\ndazwischen\n${block("B")}`;
    assert.equal(extractMarkerBlock(content, START, END), "A\n");
  });

  it("recognizes a real block as written by the htpasswd generator (Bestandskompatibilität)", () => {
    const start = "# BEGIN htpasswdgenerator-extension";
    const end = "# END htpasswdgenerator-extension";
    const existing = `${start}
# Die Anweisungen in diesem Block sind dynamisch generiert und sollten nicht manuell geändert werden.
<If "%{REQUEST_URI} =~ m#^/admin(/|$)#">
    AuthType Basic
    AuthName "Adminbereich"
    AuthUserFile /files/.htpasswd
    Require user alice bob
</If>
${end}`;
    assert.equal(hasMarkerBlock(existing, start, end), true);
    assert.match(
      extractMarkerBlock(existing, start, end) ?? "",
      /Require user alice bob/,
    );
  });
});

describe("removeMarkerBlock", () => {
  it("removes the block including markers and preserves user content", () => {
    const content = `oben\n${block("Inhalt")}\nunten`;
    assert.equal(removeMarkerBlock(content, START, END), "oben\nunten");
  });

  it("removes every occurrence", () => {
    const content = `${block("A")}\n${block("B")}\nrest`;
    assert.equal(removeMarkerBlock(content, START, END), "rest");
  });

  it("leaves content without a block untouched", () => {
    assert.equal(
      removeMarkerBlock("user\ncontent", START, END),
      "user\ncontent",
    );
  });

  it("leaves a foreign block with shared marker prefix untouched", () => {
    const other = `# BEGIN test-extension-v2\nfremd\n# END test-extension-v2\n`;
    assert.equal(removeMarkerBlock(other, START, END), other);
  });

  it("removes a block at end of file without trailing newline", () => {
    const content = `user\n${block("X")}`;
    assert.equal(removeMarkerBlock(content, START, END), "user\n");
  });
});

describe("upsertMarkerBlock", () => {
  it("appends to empty content", () => {
    assert.equal(
      upsertMarkerBlock("", START, END, block("neu")),
      `${block("neu")}\n`,
    );
  });

  it("appends after existing user content with a separating blank line", () => {
    const result = upsertMarkerBlock("user-inhalt", START, END, block("neu"));
    assert.equal(result, `user-inhalt\n\n${block("neu")}\n`);
  });

  it("replaces an existing block in place and keeps surroundings", () => {
    const content = `oben\n${block("alt")}\nunten`;
    const result = upsertMarkerBlock(content, START, END, block("neu"));
    assert.equal(result, `oben\n${block("neu")}\nunten`);
  });

  it("never touches a foreign block with shared marker prefix", () => {
    const foreign = `# BEGIN test-extension-v2\nfremd\n# END test-extension-v2`;
    const result = upsertMarkerBlock(foreign, START, END, block("neu"));
    assert.equal(result, `${foreign}\n\n${block("neu")}\n`);
  });

  it("is idempotent for the same block", () => {
    const once = upsertMarkerBlock("user", START, END, block("X"));
    const twice = upsertMarkerBlock(once, START, END, block("X"));
    assert.equal(once, twice);
  });

  it("stays idempotent when the block is passed with a trailing newline", () => {
    const withNewline = `${block("X")}\n`;
    const once = upsertMarkerBlock("user", START, END, withNewline);
    const twice = upsertMarkerBlock(once, START, END, withNewline);
    const thrice = upsertMarkerBlock(twice, START, END, withNewline);
    assert.equal(once, twice);
    assert.equal(twice, thrice);
  });

  it("does not interpret replacement patterns like $& in the block", () => {
    const tricky = block("RewriteRule $1 $& $'");
    const result = upsertMarkerBlock(block("alt"), START, END, tricky);
    assert.equal(
      extractMarkerBlock(result, START, END),
      "RewriteRule $1 $& $'\n",
    );
  });

  it("roundtrips: upsert then remove restores user content", () => {
    const user = "# eigene Regel\nRewriteEngine On";
    const withBlock = upsertMarkerBlock(user, START, END, block("X"));
    assert.equal(removeMarkerBlock(withBlock, START, END).trimEnd(), user);
  });
});
