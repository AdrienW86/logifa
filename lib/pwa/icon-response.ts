import { ImageResponse } from "next/og";
import { createElement } from "react";

const logoPath = "M1,44 1,47 3,48 38,48 40,51 46,51 40,43 2,43Z M81,11 77,11 65,15 50,18 45,20 44,22 51,37 54,51 59,51 57,40 51,24 54,22 69,19 77,16 79,17 83,26 87,42 88,57 89,58 89,74 85,77 82,77 60,84 59,82 60,81 61,64 59,57 21,57 19,59 20,62 45,62 50,71 49,73 29,73 27,75 28,78 51,78 53,82 53,88 55,90 93,79 94,60 93,59 92,42 86,20Z M53,62 56,63 56,69 55,70 52,64Z M57,9 52,5 50,5 22,28 22,30 25,33 24,34 13,34 12,36 14,37 35,37 29,29 49,12 52,11 54,13 57,13 58,11Z";

/** Generate PWA PNG resources from the same pictogram as app/icon.svg. */
export function logifaIcon(size: number, maskable = false): ImageResponse {
  const side = Math.round(size * (maskable ? 0.72 : 0.84));
  return new ImageResponse(
    createElement(
      "div",
      { style: { display: "flex", width: "100%", height: "100%", backgroundColor: "#ffffff", alignItems: "center", justifyContent: "center" } },
      createElement(
        "svg",
        { width: side, height: side, viewBox: "0 0 96 96", xmlns: "http://www.w3.org/2000/svg" },
        createElement("path", { d: logoPath, fill: "#006b26", fillRule: "evenodd" }),
      ),
    ),
    { width: size, height: size },
  );
}
