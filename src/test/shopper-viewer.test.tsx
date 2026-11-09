import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ImageViewer } from "@/components/shopper/shopper-viewer";
import { imageVariant, mapStoreItem, productGallery } from "@/lib/personal-shopper";
import { parseCarrotPage, parseLongchampPage } from "@/lib/shopper-bags";

const UQ = "https://image.uniqlo.com/UQ/ST3/jp/imagesgoods/486320/item/jpgoods_01_486320_3x4.jpg";

describe("imageVariant", () => {
  it("asks Uniqlo and Longchamp for the width, leaves other hosts alone", () => {
    expect(imageVariant(UQ, 160)).toBe(`${UQ}?width=160`);
    expect(imageVariant(`${UQ}?width=999`, 320)).toBe(`${UQ}?width=320`);
    const lc = "https://www.longchamp.com/dw/image/v2/X/a/images/DIS/L1_0.png?sw=400&sh=400&sm=fit";
    expect(imageVariant(lc, 1000)).toContain("sw=1000&sh=1000");
    const carrot = "https://carrot.itembox.cloud/product/1/a.jpg?size=xl";
    expect(imageVariant(carrot, 160)).toBe(carrot);
    expect(imageVariant(null, 160)).toBeNull();
    expect(imageVariant("not a url", 160)).toBe("not a url");
  });
});

describe("productGallery", () => {
  const product = {
    imageUrl: UQ,
    colors: [
      { code: "01", name: "Off White", image: UQ },
      { code: "35", name: "Pink", image: UQ.replace("_01_", "_35_") },
    ],
    gallery: [UQ.replace("item/jpgoods_01", "sub/jpgoods"), UQ.replace("_01_", "_35_")],
  };

  it("puts the chosen colour first and drops duplicates", () => {
    const list = productGallery(product, "35");
    expect(list[0]).toEqual({ src: product.colors[1]!.image, label: "Pink" });
    expect(new Set(list.map((i) => i.src.split("?")[0])).size).toBe(list.length);
    expect(list.map((i) => i.label)).toEqual(["Pink", "Foto utama", "Detail 1"]);
  });

  it("works without colours or extras and caps at 16", () => {
    expect(productGallery({ imageUrl: UQ, colors: [], gallery: [] })).toHaveLength(1);
    expect(productGallery({ imageUrl: null, colors: [], gallery: [] })).toEqual([]);
    const many = Array.from({ length: 30 }, (_, i) => `https://image.uniqlo.com/x/${i}.jpg`);
    expect(productGallery({ imageUrl: null, colors: [], gallery: many })).toHaveLength(16);
  });
});

describe("gallery from the stores", () => {
  it("reads Uniqlo sub images and skips videos", () => {
    const sub = (name: string) => ({
      image: `https://image.uniqlo.com/UQ/ST3/jp/imagesgoods/1/sub/${name}.jpg`,
    });
    const row = mapStoreItem(
      {
        productId: "E486320-000",
        name: "Knit",
        priceGroup: "00",
        prices: { base: { value: 2990, currency: { code: "JPY" } } },
        images: {
          main: {},
          sub: [
            sub("a"),
            { video: "https://image.uniqlo.com/x.mp4" },
            sub("a"),
            sub("b"),
            { image: "https://evil.example/x.jpg" },
          ],
        },
      },
      "uniqlo",
      "Atasan",
      0,
      10,
    );
    expect(row?.gallery).toEqual([
      "https://image.uniqlo.com/UQ/ST3/jp/imagesgoods/1/sub/a.jpg",
      "https://image.uniqlo.com/UQ/ST3/jp/imagesgoods/1/sub/b.jpg",
    ]);
  });

  it("collects Carrot carousel photos and the Longchamp second photo", () => {
    const carrot = `<article class="fs-c-productList__list__item"><a href="/c/legatolargo/l-ruck/LH-W0164">
      <img data-layzr="https://carrot.itembox.cloud/product/1/main.jpg"></a>
      <figure><figcaption>ブラック</figcaption><img data-lazy="x" data-src="https://carrot.itembox.cloud/product/1/a.jpg"></figure>
      <figure><figcaption>ブルー</figcaption><img data-lazy="x" data-src="https://carrot.itembox.cloud/product/1/b.jpg"></figure>
      <span class="fs-c-productName__copy">Legato Largo</span><span class="fs-c-productName__name">リュック</span>
      <span class="fs-c-price__value">6,820</span></article>`;
    expect(parseCarrotPage(carrot, "legato")[0]?.gallery).toEqual([
      "https://carrot.itembox.cloud/product/1/a.jpg",
      "https://carrot.itembox.cloud/product/1/b.jpg",
    ]);
    const lc = `<img class="tile-image product-item__img " src="https://www.longchamp.com/dw/image/v2/X/L1_0.png?sw=400">
      <img class="tile-image product-item__img cropped" src="https://www.longchamp.com/dw/image/v2/X/L1_1.png?sw=400">
      <a href="/jp/ja/products/a-L1899089002.html" class="product-item__link"><span class="product-item__line">Le Pliage</span>
      <span class="product-item__style">Mocha</span><meta itemprop="priceCurrency" content="JPY" />
      <span itemprop="price" content="28600"></span></a><a data-pid="L1899089002" class="x">`;
    expect(parseLongchampPage(lc)[0]?.gallery).toEqual([
      "https://www.longchamp.com/dw/image/v2/X/L1_1.png?sw=400",
    ]);
  });
});

describe("ImageViewer", () => {
  const images = [
    { src: UQ, label: "Foto utama" },
    { src: UQ.replace("_01_", "_35_"), label: "Pink" },
    { src: UQ.replace("item/jpgoods_01", "sub/jpgoods"), label: "Detail 1" },
  ];

  it("shows the counter, the label and jumps with the thumbnails", () => {
    render(<ImageViewer open title="Knit" images={images} index={0} onClose={() => {}} />);
    expect(screen.getByText("1 / 3")).toBeTruthy();
    expect(screen.getAllByTestId("viewer-slide")).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: "Foto 3: Detail 1" }));
    expect(screen.getByText("3 / 3")).toBeTruthy();
    expect(screen.getAllByText("Detail 1").length).toBeGreaterThan(0);
  });

  it("closes from the button and renders the footer action", () => {
    const onClose = vi.fn();
    render(
      <ImageViewer
        open
        title="Knit"
        images={images}
        index={0}
        onClose={onClose}
        footer={<button type="button">Titip barang ini</button>}
      />,
    );
    expect(screen.getByRole("button", { name: "Titip barang ini" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Tutup foto" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("renders nothing when there is no photo or it is closed", () => {
    const { container } = render(
      <ImageViewer open title="x" images={[]} index={0} onClose={() => {}} />,
    );
    expect(container.innerHTML).toBe("");
    render(<ImageViewer open={false} title="Knit" images={images} index={0} onClose={() => {}} />);
    expect(screen.queryByText("1 / 3")).toBeNull();
  });
});
