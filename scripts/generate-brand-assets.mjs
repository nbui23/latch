import { execFileSync } from 'child_process'
import { mkdirSync, rmSync, writeFileSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const VIEWBOX_SIZE = 1024
const TRAY_VIEWBOX_SIZE = 18

const BRAND_COLORS = {
  dark: '#111827',
  light: '#f8fafc',
}

const MARK_SHAPES = {
  vertical: { x: 286, y: 120, width: 176, height: 784, radius: 88 },
  foot: { x: 286, y: 728, width: 452, height: 176, radius: 88 },
}

const TRAY_SHAPES = {
  active: {
    vertical: { x: 4.15, y: 2.35, width: 3.85, height: 13.1, radius: 1.92 },
    foot: { x: 4.15, y: 11.65, width: 10.15, height: 3.8, radius: 1.9 },
  },
  inactive: {
    points: [
      [5.45, 2.85],
      [5.45, 14.15],
      [13.65, 14.15],
    ],
    stroke: 2.8,
  },
}

const PYTHON_RENDERER = String.raw`
import json
import sys
from PIL import Image, ImageDraw

output_path = sys.argv[1]
config = json.loads(sys.argv[2])
size = int(config["size"])
viewbox = float(config["viewbox"])
render_scale = int(config["render_scale"])
canvas_size = size * render_scale
scale = canvas_size / viewbox

def scale_rect(rect):
    return (
        rect["x"] * scale,
        rect["y"] * scale,
        (rect["x"] + rect["width"]) * scale,
        (rect["y"] + rect["height"]) * scale,
    )

def scale_radius(radius):
    return radius * scale

image = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
draw = ImageDraw.Draw(image)

mode = config["mode"]
color = config["color"]

if mode == "mark":
    shapes = config["shapes"]
    for name in ("vertical", "foot"):
        rect = shapes[name]
        draw.rounded_rectangle(
            scale_rect(rect),
            radius=scale_radius(rect["radius"]),
            fill=color,
        )
elif mode == "tray-active":
    shapes = config["shapes"]
    for name in ("vertical", "foot"):
        rect = shapes[name]
        draw.rounded_rectangle(
            scale_rect(rect),
            radius=scale_radius(rect["radius"]),
            fill=color,
        )
elif mode == "tray-inactive":
    stroke = max(1, round(config["stroke"] * scale))
    points = [(x * scale, y * scale) for x, y in config["points"]]
    draw.line(points, fill=color, width=stroke, joint="curve")
else:
    raise SystemExit(f"Unsupported mode: {mode}")

if render_scale > 1:
    image = image.resize((size, size), Image.Resampling.LANCZOS)

if output_path.endswith(".icns"):
    image.save(
        output_path,
        sizes=[(16, 16), (32, 32), (64, 64), (128, 128), (256, 256), (512, 512), (1024, 1024)],
    )
else:
    image.save(output_path)
`

function ensureDir(pathname) {
  mkdirSync(pathname, { recursive: true })
}

function brandSvgMarkup(color, title, description) {
  const { vertical, foot } = MARK_SHAPES
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${VIEWBOX_SIZE}" height="${VIEWBOX_SIZE}" viewBox="0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}" fill="none" role="img" aria-labelledby="title desc">
  <title id="title">${title}</title>
  <desc id="desc">${description}</desc>
  <rect x="${vertical.x}" y="${vertical.y}" width="${vertical.width}" height="${vertical.height}" rx="${vertical.radius}" fill="${color}" />
  <rect x="${foot.x}" y="${foot.y}" width="${foot.width}" height="${foot.height}" rx="${foot.radius}" fill="${color}" />
</svg>
`
}

function writeSvg(pathname, color, title, description) {
  writeFileSync(pathname, brandSvgMarkup(color, title, description))
}

function writeRaster(pathname, size, mode, color, config) {
  const renderScale = size <= 18 ? 12 : size <= 48 ? 10 : size <= 128 ? 8 : 5
  execFileSync(
    'python3',
    [
      '-c',
      PYTHON_RENDERER,
      pathname,
      JSON.stringify({
        size,
        viewbox: mode.startsWith('tray') ? TRAY_VIEWBOX_SIZE : VIEWBOX_SIZE,
        render_scale: renderScale,
        mode,
        color,
        ...config,
      }),
    ],
    { stdio: 'inherit' },
  )
}

function main() {
  const desktopAssetDir = join(ROOT, 'apps', 'desktop', 'src', 'renderer', 'assets')
  const extensionIconsDir = join(ROOT, 'apps', 'extension', 'icons')
  const desktopResourcesDir = join(ROOT, 'apps', 'desktop', 'resources')

  ensureDir(desktopAssetDir)
  ensureDir(extensionIconsDir)
  ensureDir(desktopResourcesDir)

  const title = 'Latch L brand mark'
  const description = 'A simple polished capital L used as the Latch brand mark.'

  writeSvg(join(desktopAssetDir, 'latch-mark-dark.svg'), BRAND_COLORS.dark, title, description)

  writeRaster(join(extensionIconsDir, 'icon16.png'), 16, 'mark', BRAND_COLORS.dark, { shapes: MARK_SHAPES })
  writeRaster(join(extensionIconsDir, 'icon48.png'), 48, 'mark', BRAND_COLORS.dark, { shapes: MARK_SHAPES })
  writeRaster(join(extensionIconsDir, 'icon128.png'), 128, 'mark', BRAND_COLORS.dark, { shapes: MARK_SHAPES })
  writeRaster(join(desktopResourcesDir, 'icon.png'), 256, 'mark', BRAND_COLORS.dark, { shapes: MARK_SHAPES })
  writeRaster(join(desktopResourcesDir, 'icon.icns'), 1024, 'mark', BRAND_COLORS.dark, { shapes: MARK_SHAPES })

  writeRaster(join(desktopResourcesDir, 'tray-inactiveTemplate.png'), 18, 'tray-inactive', '#ffffff', TRAY_SHAPES.inactive)
  writeRaster(join(desktopResourcesDir, 'tray-inactiveTemplate@2x.png'), 36, 'tray-inactive', '#ffffff', TRAY_SHAPES.inactive)
  writeRaster(join(desktopResourcesDir, 'tray-activeTemplate.png'), 18, 'tray-active', '#ffffff', { shapes: TRAY_SHAPES.active })
  writeRaster(join(desktopResourcesDir, 'tray-activeTemplate@2x.png'), 36, 'tray-active', '#ffffff', { shapes: TRAY_SHAPES.active })

  rmSync(join(desktopAssetDir, 'latch-lock.svg'), { force: true })
  rmSync(join(desktopAssetDir, 'latch-mark-light.svg'), { force: true })
  rmSync(join(desktopAssetDir, 'latch-mark.svg'), { force: true })
  rmSync(join(ROOT, 'apps', 'extension', 'src', 'branding', 'latch-lock.svg'), { force: true })
  rmSync(join(ROOT, 'apps', 'extension', 'src', 'branding', 'latch-mark-light.svg'), { force: true })
  rmSync(join(ROOT, 'apps', 'extension', 'src', 'branding', 'latch-mark-dark.svg'), { force: true })
  rmSync(join(ROOT, 'apps', 'extension', 'src', 'branding', 'latch-mark.svg'), { force: true })
  rmSync(join(desktopResourcesDir, 'trayInactiveTemplate.png'), { force: true })
  rmSync(join(desktopResourcesDir, 'trayInactiveTemplate@2x.png'), { force: true })
  rmSync(join(desktopResourcesDir, 'trayActiveTemplate.png'), { force: true })
  rmSync(join(desktopResourcesDir, 'trayActiveTemplate@2x.png'), { force: true })
  rmSync(join(desktopResourcesDir, 'icon.iconset'), { recursive: true, force: true })
  rmSync(join(desktopResourcesDir, 'latch-lock.iconset'), { recursive: true, force: true })
  rmSync(join(desktopResourcesDir, 'icons'), { recursive: true, force: true })
}

main()
