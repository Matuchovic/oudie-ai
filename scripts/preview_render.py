"""Offline check: project the point cloud with the same camera and colour
ramp as the shader and splat it additively. Not a pixel-exact match to
WebGL, but enough to confirm the silhouette, the band spacing and the
face heat before shipping."""

import sys, math
import numpy as np
from PIL import Image

W, H = 900, 1000
FOV = 34.0

n = np.fromfile("/tmp/pts.bin", dtype=np.float32).reshape(-1, 6)
nrm = np.fromfile("/tmp/nrm.bin", dtype=np.float32).reshape(-1, 3)
P = n[:, 0:3].astype(np.float64)
face = n[:, 4]
kind = n[:, 5]
fade = np.fromfile("/tmp/fade.bin", dtype=np.float32).astype(np.float64)
N = nrm.astype(np.float64)
N /= np.linalg.norm(N, axis=1, keepdims=True) + 1e-9


def render(az_deg, el_deg, radius, out):
    az, el = math.radians(az_deg), math.radians(el_deg)
    eye = np.array([
        math.sin(az) * math.cos(el) * radius,
        math.sin(el) * radius + 0.12,
        math.cos(az) * math.cos(el) * radius,
    ])
    target = np.array([0.0, 0.1, 0.0])
    fwd = target - eye
    fwd /= np.linalg.norm(fwd)
    right = np.cross(fwd, [0, 1, 0]); right /= np.linalg.norm(right)
    up = np.cross(right, fwd)

    rel = P - eye
    cx, cy, cz = rel @ right, rel @ up, rel @ fwd
    vis = cz > 0.05

    f = 1.0 / math.tan(math.radians(FOV) / 2)
    sx = (cx / cz) * f * (H / 2) + W / 2
    sy = -(cy / cz) * f * (H / 2) + H / 2

    # Fresnel in view space: bright exactly at the silhouette.
    nv = np.stack([N @ right, N @ up, N @ fwd], axis=1)
    vd = -np.stack([cx, cy, cz], axis=1)
    vd /= np.linalg.norm(vd, axis=1, keepdims=True) + 1e-9
    rim = (1.0 - np.abs(np.sum(nv * vd, axis=1))) ** 2.9

    CYAN = np.array([0.055, 0.640, 1.000])
    ICE = np.array([0.800, 0.960, 1.000])
    ORANGE = np.array([1.000, 0.330, 0.045])
    AMBER = np.array([1.000, 0.700, 0.160])
    HOT = np.array([1.000, 0.960, 0.800])

    def ss(e0, e1, x):
        t = np.clip((x - e0) / (e1 - e0), 0, 1)
        return t * t * (3 - 2 * t)

    fm = np.minimum(1.0, face * 1.55)
    col = np.tile(CYAN, (len(fm), 1))
    for tgt, e0, e1 in ((ORANGE, 0.14, 0.54), (AMBER, 0.48, 0.80), (HOT, 0.76, 1.00)):
        w = ss(e0, e1, fm)[:, None]
        col = col * (1 - w) + tgt[None, :] * w
    rw = (rim * 0.40)[:, None]
    col = col * (1 - rw) + ICE[None, :] * rw
    throat = (kind > 1.5) & (kind < 2.5)
    col[throat] = AMBER

    inten = (0.62 + rim * 1.55 + fm * 2.35) * 0.55 * fade
    size = np.where(kind > 2.5, 1.25, 2.15) * (1 + rim * 1.5) * (320.0 / cz) / 300.0
    size = np.clip(size * 1.6, 0.7, 5.0)

    buf = np.zeros((H, W, 3), dtype=np.float64)
    ok = vis & (sx > -10) & (sx < W + 10) & (sy > -10) & (sy < H + 10)
    xs, ys = sx[ok].astype(int), sy[ok].astype(int)
    cs, isr, szs = col[ok], inten[ok], size[ok]

    for r in range(3):
        w = math.exp(-(r * r) / 2.2)
        for dx in range(-r, r + 1):
            for dy in range(-r, r + 1):
                if abs(dx) != r and abs(dy) != r and r > 0:
                    continue
                X = np.clip(xs + dx, 0, W - 1)
                Y = np.clip(ys + dy, 0, H - 1)
                np.add.at(buf, (Y, X), cs * (isr * w * np.clip(szs, 0.5, 3))[:, None] * 0.10)

    # Mirror the runtime's two-scale bloom so this check is representative.
    from scipy.ndimage import gaussian_filter
    tight = gaussian_filter(buf, sigma=(3, 3, 0))
    wide = gaussian_filter(buf, sigma=(11, 11, 0))
    lit = buf + tight * 0.78 + wide * 0.52

    yy = np.linspace(0, 1, H)[:, None, None]
    xx = np.linspace(0, 1, W)[None, :, None]
    bg = (np.array([0.020, 0.027, 0.047]) +
          (np.array([0.078, 0.102, 0.149]) - np.array([0.020, 0.027, 0.047])) * (1 - yy) ** 1.35)
    vig = 1.0 - (((xx - 0.5) ** 2) + ((yy - 0.5) ** 2)) * 0.85
    c = bg * vig + lit
    c = c / (c + 0.85)
    l = (c * np.array([0.2126,0.7152,0.0722])).sum(axis=2, keepdims=True)
    c = l + (c - l) * 1.42
    Image.fromarray((np.clip(c, 0, 1) ** (1 / 2.2) * 255).astype(np.uint8)).save(out)
    print(out, "->", int(ok.sum()), "points drawn")


render(0, 4, 4.0, "/tmp/view_front.png")
render(-72, 4, 5.9, "/tmp/view_profile.png")
render(-35, 4, 5.2, "/tmp/view_three_quarter.png")
