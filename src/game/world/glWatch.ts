/**
 * Watches for the GPU dropping the 3D context (phones running out of graphics memory). Instead of
 * a frozen white screen: retry once at Low quality, then explain.
 */
const KEY = 'fcl.quality';
const RETRIED = 'fcl.glRetried';

export const glStatus = { lost: false, renderer: '', webgl: '' };

export function watchContext(
  canvas: HTMLCanvasElement,
  gl: WebGL2RenderingContext | WebGLRenderingContext,
): void {
  try {
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    glStatus.renderer = String(
      dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
    );
    glStatus.webgl = String(gl.getParameter(gl.VERSION));
  } catch {
    // Diagnostics only.
  }
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    glStatus.lost = true;
    try {
      if (!sessionStorage.getItem(RETRIED) && localStorage.getItem(KEY) !== 'low') {
        sessionStorage.setItem(RETRIED, '1');
        localStorage.setItem(KEY, 'low');
        window.location.reload();
        return;
      }
    } catch {
      // Storage blocked: fall through to the message.
    }
    window.dispatchEvent(new Event('fcl:gl-lost'));
  });
}
