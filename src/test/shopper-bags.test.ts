import { describe, expect, it } from "vitest";
import {
  parseCarrotPage,
  parseLongchampPage,
  decodeEntities,
  isBagBrand,
} from "@/lib/shopper-bags";

const carrotTile = (
  opts: { copy?: string; price?: string; stock?: string[]; href?: string } = {},
) => `
<article class="fs-c-productList__list__item fs-c-productListItem" data-product-id="1">
<div class="fs-c-productListItem__image fs-c-productImage"><a href="${opts.href ?? "/c/legatolargo/l-ruck/LH-W0164"}">
<img data-layzr="https://carrot.itembox.cloud/product/1/a.jpg?size&#x3D;xl&amp;w&#x3D;1" alt="x"></a></div>
<figure><figcaption>ブラック</figcaption><img data-lazy="x" data-src="https://carrot.itembox.cloud/product/1/b.jpg?size&#x3D;org"></figure>
<figure><figcaption>ブルー</figcaption><img data-lazy="x" data-src="https://carrot.itembox.cloud/product/1/c.jpg"></figure>
<h2><a href="/c/legatolargo/l-ruck/LH-W0164"><span class="fs-c-productName__copy">${opts.copy ?? "Legato Largo"}</span>
<span class="fs-c-productName__name">合皮トート型リュック</span></a></h2>
<span class="fs-c-price__value">${opts.price ?? "6,820"}</span>
${(opts.stock ?? ["ブラック:in", "ブルー:out"])
  .map((e) => {
    const [name, state] = e.split(":");
    return `<div class="fs-c-variationCart__variationName"><span class="fs-c-variationCart__variationName__name">${name}</span><span class="fs-c-variationCart__variationName__stock${state === "out" ? " fs-c-variationCart__variationName__stock--outOfStock" : ""}">${state === "out" ? "在庫なし" : ""}</span></div>`;
  })
  .join("")}
</article>`;

describe("Carrot Online bag pages", () => {
  it("reads name, JPY price, photo and only the colours in stock", () => {
    const rows = parseCarrotPage(carrotTile(), "legato");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      brand: "legato",
      productCode: "LH-W0164",
      category: "Tas",
      priceMinor: 6820,
      productUrl: "https://www.carrot-online.jp/c/legatolargo/l-ruck/LH-W0164",
      sizes: [],
    });
    expect(rows[0]!.name).toBe("Legato Largo 合皮トート型リュック");
    expect(rows[0]!.imageUrl).toBe("https://carrot.itembox.cloud/product/1/a.jpg?size=xl&w=1");
    // one colour left means no colour choice to show
    expect(rows[0]!.colors).toEqual([]);
  });

  it("keeps several in-stock colours with their photos", () => {
    const rows = parseCarrotPage(carrotTile({ stock: ["ブラック:in", "ブルー:in"] }), "legato");
    expect(rows[0]!.colors.map((c) => c.name)).toEqual(["ブラック", "ブルー"]);
    expect(rows[0]!.colors[1]!.image).toBe("https://carrot.itembox.cloud/product/1/c.jpg");
  });

  it("drops sold-out products, other brands and unpriced tiles", () => {
    expect(
      parseCarrotPage(carrotTile({ stock: ["ブラック:out", "ブルー:out"] }), "legato"),
    ).toEqual([]);
    expect(parseCarrotPage(carrotTile({ copy: "Other Brand" }), "legato")).toEqual([]);
    expect(parseCarrotPage(carrotTile({ price: "abc" }), "legato")).toEqual([]);
    expect(parseCarrotPage(carrotTile({ copy: "anello" }), "anello")).toHaveLength(1);
  });

  it("returns nothing for a page it does not understand", () => {
    expect(parseCarrotPage("<html>maintenance</html>", "legato")).toEqual([]);
  });
});

const longchampTile = (pid: string, price: string, currency = "JPY") => `
<img class="tile-image product-item__img " src="https://www.longchamp.com/dw/image/v2/X/${pid}_0.png?sw&#x3D;400&amp;sh=400" alt="a">
<a href="/jp/ja/products/%E3%83%90%E3%83%83%E3%82%B0-m-${pid}.html" class="product-item__link" itemprop="url">
<span class="product-item__line upper fs-l">ル プリアージュ&reg; M</span>
<span class="product-item__style upper">モカ</span>
<meta itemprop="priceCurrency" content="${currency}" />
<span class="sales value" itemprop="price" content="${price}" contentprice="${price}"></span></a>
<a href="javascript:void(0);" data-pid="${pid}" class="add-to-wishlistTile">`;

describe("Longchamp pages", () => {
  it("reads each colour tile with its price and decoded name", () => {
    const rows = parseLongchampPage(
      longchampTile("L1899089002", "28600") + longchampTile("10284089002", "31900"),
    );
    expect(rows.map((r) => [r.productCode, r.priceMinor])).toEqual([
      ["L1899089002", 28600],
      ["10284089002", 31900],
    ]);
    expect(rows[0]).toMatchObject({
      brand: "longchamp",
      category: "Tas",
      name: "ル プリアージュ® M モカ",
    });
    expect(rows[0]!.productUrl.startsWith("https://www.longchamp.com/jp/ja/products/")).toBe(true);
  });

  it("skips non-JPY, unpriced and duplicate tiles", () => {
    expect(parseLongchampPage(longchampTile("L1899089002", "99", "EUR"))).toEqual([]);
    expect(parseLongchampPage(longchampTile("L1899089002", "0"))).toEqual([]);
    expect(
      parseLongchampPage(
        longchampTile("L1899089002", "28600") + longchampTile("L1899089002", "28600"),
      ),
    ).toHaveLength(1);
  });
});

describe("helpers", () => {
  it("decodes entities and knows the bag brands", () => {
    expect(decodeEntities("a&#x3D;b&amp;c&yen;&unknown;")).toBe("a=b&c¥&unknown;");
    expect(isBagBrand("legato") && isBagBrand("anello") && isBagBrand("longchamp")).toBe(true);
    expect(isBagBrand("uniqlo")).toBe(false);
  });
});
