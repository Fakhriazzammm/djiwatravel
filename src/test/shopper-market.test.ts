import { describe, expect, it } from "vitest";
import {
  marketBlocker,
  marketMaxQuantity,
  parseMarketPage,
  parseMarketUrl,
  safeMarketImage,
  type MarketPage,
} from "@/lib/shopper-market";
import {
  DEFAULT_SHOPPER_CONFIG,
  marketEnabled,
  parseShopperConfig,
  quoteShopperOrder,
} from "@/lib/personal-shopper";

const page = (over: Partial<MarketPage>): MarketPage => ({
  title: "",
  text: "",
  ogTitle: null,
  ogImage: null,
  metaPrice: null,
  metaCurrency: null,
  itempropPrice: null,
  itempropCurrency: null,
  itempropAvailability: null,
  ...over,
});

describe("marketplace links", () => {
  it("accepts only single item pages on known hosts", () => {
    expect(parseMarketUrl("https://jp.mercari.com/item/m99035619244?srsltid=x")).toEqual({
      site: "mercari",
      externalId: "m99035619244",
      url: "https://jp.mercari.com/item/m99035619244",
    });
    expect(parseMarketUrl("https://item.rakuten.co.jp/w-import/uni-088/?scid=x")).toEqual({
      site: "rakuten",
      externalId: "w-import/uni-088",
      url: "https://item.rakuten.co.jp/w-import/uni-088/",
    });
    for (const bad of [
      "http://jp.mercari.com/item/m99035619244",
      "https://jp.mercari.com/search?keyword=uniqlo",
      "https://jp.mercari.com.evil.example/item/m99035619244",
      "https://user:pw@jp.mercari.com/item/m99035619244",
      "https://item.rakuten.co.jp/",
      "https://www.amazon.co.jp/dp/B07WNLTH6F",
      "not a url",
    ])
      expect(parseMarketUrl(bad), bad).toBeNull();
  });
  it("only trusts images from the marketplaces' own CDNs", () => {
    expect(
      safeMarketImage("https://static.mercdn.net/item/detail/orig/photos/m1_1.jpg?1"),
    ).toContain("mercdn");
    expect(safeMarketImage("http://shop.r10s.jp/w-import/cabinet/uni-088.jpg")).toBe(
      "https://shop.r10s.jp/w-import/cabinet/uni-088.jpg",
    );
    expect(safeMarketImage("https://evil.example/x.jpg")).toBeNull();
  });
});

describe("reading an item page", () => {
  const mercari = parseMarketUrl("https://jp.mercari.com/item/m99035619244")!;
  const rakuten = parseMarketUrl("https://item.rakuten.co.jp/w-import/uni-088/")!;

  it("reads a Mercari item that can be bought", () => {
    const parsed = parseMarketPage(
      mercari,
      page({
        title: "ユニクロ　ダウン by メルカリ",
        ogImage: "https://static.mercdn.net/item/detail/orig/photos/m99035619244_1.jpg?1",
        metaPrice: "2999",
        metaCurrency: "JPY",
        text: "1 / 4ユニクロ ダウン\nUNIQLO / サイズ : XL(LL)5購入手続きへ商品の説明 ### 商品の情報 ### サイズ\n\nXL(LL)\n\n### 商品の状態\n\n目立った傷や汚れなし\n\n### 発送元の地域\n福岡県",
      }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.listing).toMatchObject({
      name: "ユニクロ　ダウン",
      priceJpy: 2999,
      sold: false,
      sizeText: "XL(LL)",
      conditionText: "目立った傷や汚れなし",
    });
  });
  it("treats a Mercari item without a buy button text as available, and a disabled checkout button as sold", () => {
    const base = {
      title: "ダウン by メルカリ",
      metaPrice: "1200",
      metaCurrency: "JPY",
      text: "1 / 4ユニクロダウンサイズXL(LL)商品の状態新品、未使用",
    };
    const open = parseMarketPage(mercari, page({ ...base, checkoutButtonDisabled: false }));
    expect(open.ok && open.listing.sold).toBe(false);
    const unchecked = parseMarketPage(mercari, page(base));
    expect(unchecked.ok && unchecked.listing.sold).toBe(false);
    const sold = parseMarketPage(mercari, page({ ...base, checkoutButtonDisabled: true }));
    expect(sold.ok && sold.listing.sold).toBe(true);
  });
  it("marks a sold Mercari item and refuses to sell it", () => {
    const parsed = parseMarketPage(
      mercari,
      page({
        title: "ダウン by メルカリ",
        metaPrice: "5500",
        metaCurrency: "JPY",
        text: "ユニクロ ダウンジャケット売り切れました",
      }),
    );
    expect(parsed.ok && parsed.listing.sold).toBe(true);
    expect(marketBlocker({ sold: true })).toMatch(/terjual/);
  });
  it("never invents a price: no price, wrong currency or silly values are rejected", () => {
    expect(
      parseMarketPage(mercari, page({ title: "x by メルカリ", text: "購入手続きへ" })).ok,
    ).toBe(false);
    expect(
      parseMarketPage(
        mercari,
        page({
          title: "ダウン by メルカリ",
          metaPrice: "30",
          metaCurrency: "JPY",
          text: "購入手続きへ",
        }),
      ).ok,
    ).toBe(false);
    expect(
      parseMarketPage(
        mercari,
        page({
          title: "ダウン by メルカリ",
          metaPrice: "5000",
          metaCurrency: "USD",
          text: "購入手続きへ",
        }),
      ).ok,
    ).toBe(false);
    expect(
      parseMarketPage(
        mercari,
        page({
          title: "ダウン by メルカリ",
          metaPrice: "99999999",
          metaCurrency: "JPY",
          text: "購入手続きへ",
        }),
      ).ok,
    ).toBe(false);
  });
  it("reads a Rakuten item from its structured metas", () => {
    const parsed = parseMarketPage(
      rakuten,
      page({
        title: "x",
        ogTitle:
          "【楽天市場】ユニクロ ヒートテック Tシャツ Vネック メンズ：ワールドインポート 楽天市場店",
        ogImage: "https://shop.r10s.jp/w-import/cabinet/uni-01/uni-088.jpg",
        itempropPrice: "2980",
        itempropCurrency: "JPY",
        itempropAvailability: "http://schema.org/InStock",
      }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.listing.name).toBe("ユニクロ ヒートテック Tシャツ Vネック メンズ");
    expect(parsed.listing.priceJpy).toBe(2980);
    expect(parsed.listing.sold).toBe(false);
    const out = parseMarketPage(
      rakuten,
      page({
        ogTitle: "【楽天市場】商品：店 楽天市場店",
        itempropPrice: "2980",
        itempropCurrency: "JPY",
        itempropAvailability: "http://schema.org/OutOfStock",
      }),
    );
    expect(out.ok && out.listing.sold).toBe(true);
  });
});

describe("marketplace pricing and settings", () => {
  it("adds delivery inside Japan once per marketplace item, outside the service fee", () => {
    const q = quoteShopperOrder(
      [{ unitMinor: 2999, quantity: 1 }],
      105,
      { feePercent: 10, shippingIdr: 60000 },
      35000,
    );
    expect(q.subtotalIdr).toBe(314895);
    expect(q.domesticIdr).toBe(35000);
    expect(q.feeIdr).toBe(31500);
    expect(q.totalIdr).toBe(314895 + 35000 + 31500 + 60000);
    expect(quoteShopperOrder([], 105, { feePercent: 10, shippingIdr: 60000 }, 35000).totalIdr).toBe(
      0,
    );
  });
  it("ships off, with limits, and Mercari items are single", () => {
    expect(DEFAULT_SHOPPER_CONFIG.market.enabled).toBe(false);
    const on = parseShopperConfig({
      enabled: true,
      market: { enabled: true, sites: { rakuten: false } },
    });
    expect(marketEnabled(on, "mercari")).toBe(true);
    expect(marketEnabled(on, "rakuten")).toBe(false);
    expect(marketEnabled(DEFAULT_SHOPPER_CONFIG, "mercari")).toBe(false);
    expect(() => parseShopperConfig({ market: { domesticIdr: -1 } })).toThrow();
    expect(() => parseShopperConfig({ market: { lookupsPerDay: 0 } })).toThrow();
    expect(marketMaxQuantity("mercari", 5)).toBe(1);
    expect(marketMaxQuantity("rakuten", 5)).toBe(5);
  });
});
