figma.showUI(__html__, { width: 400, height: 600 });

figma.ui.onmessage = async (msg) => {
  if (msg.type === 'close') {
    figma.closePlugin();
  }

  if (msg.type === 'palette-result') {
    console.log('Palette generated:', msg.palette);
  }

  if (msg.type === 'generate-palette') {
    const mood = msg.mood;

    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": "Bearer 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", // ← REPLACE with secure method in prod
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "gpt-3.5-turbo",
          messages: [
            {
              role: "user",
              content: `Generate exactly 5 hex color codes for the mood: ${mood}. Only return the hex codes.`
            }
          ],
          temperature: 0.7
        })
      });

      const data = await response.json();
      const text = data.choices[0].message.content;
      const hexes = text.match(/#[0-9A-Fa-f]{6}/g) || [];

      if (hexes.length < 5) {
        throw new Error("Less than 5 valid hex codes returned.");
      }

      // Font/background pairing logic
      function getYIQ(hex) {
        const c = hex.replace("#", "");
        const r = parseInt(c.substr(0, 2), 16);
        const g = parseInt(c.substr(2, 2), 16);
        const b = parseInt(c.substr(4, 2), 16);
        return ((r * 299) + (g * 587) + (b * 114)) / 1000;
      }

      const sorted = [...hexes].sort((a, b) => getYIQ(a) - getYIQ(b));
      const fontPairs = [
        { text: sorted[0], background: sorted[sorted.length - 1] },
        { text: sorted[sorted.length - 1], background: sorted[0] }
      ];

      const decorationColors = hexes.slice(1, 4);

      figma.ui.postMessage({
        type: 'palette-result',
        palette: hexes,
        fontPairs,
        decorationColors
      });

    } catch (error) {
      console.error('OpenAI error:', error);
      figma.ui.postMessage({
        type: 'palette-error',
        error: error.message
      });
    }
  }

  if (msg.type === 'apply-colors') {
  const fontPairs = msg.fontPairs;
  const decorations = msg.decorationColors;
  const selection = figma.currentPage.selection;

  if (selection.length === 0) {
    figma.notify("Please select at least one element!");
    return;
  }

  let textApplied = false;
  let bgApplied = false;
  let decorationIndex = 0;

  for (const node of selection) {
    if (node.type === 'TEXT' && !textApplied && fontPairs.length > 0) {
      if ("fontName" in node) {
        const font = node.fontName;
        if (typeof font === "object" && "family" in font && "style" in font) {
          await figma.loadFontAsync(font);
          node.fills = [{ type: 'SOLID', color: hexToRGB(fontPairs[0].text) }];
          textApplied = true;
          continue;
        } else {
          figma.notify("Font loading failed. Use a standard font.");
          continue;
        }
      }
    }

    if ("fills" in node && node.fills !== figma.mixed) {
      if (!bgApplied && fontPairs.length > 0) {
        const fills = [...node.fills];
        fills[0] = { type: 'SOLID', color: hexToRGB(fontPairs[0].background) };
        node.fills = fills;
        bgApplied = true;
      } else if (decorations[decorationIndex]) {
        const fills = [...node.fills];
        fills[0] = { type: 'SOLID', color: hexToRGB(decorations[decorationIndex]) };
        node.fills = fills;
        decorationIndex++;
      }
    }
  }

  figma.notify("Colors applied to selected elements!");
  }
};

// Helper: Convert hex to RGB object (0-1 range)
function hexToRGB(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return { r, g, b };
}
