'use client'
import { useEffect, useRef } from 'react'

/**
 * Cinemagraph hero: mirrored Laguna Beach photo (cliff + houses on right, calm
 * water across the rest), with subtle pixel-level displacement on the water
 * region. The shader mirrors the photo at sample time so we don't ship a
 * pre-flipped asset.
 */
export default function LiveBeachHero() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const gl = canvas.getContext('webgl', { antialias: true, premultipliedAlpha: false })
    if (!gl) return

    const vs = `
      attribute vec2 a_pos;
      varying vec2 v_uv;
      void main() {
        v_uv = a_pos * 0.5 + 0.5;
        gl_Position = vec4(a_pos, 0.0, 1.0);
      }
    `
    const fs = `
      precision highp float;
      varying vec2 v_uv;
      uniform sampler2D u_image;
      uniform float u_time;

      void main() {
        // Screen space, y top-down
        vec2 sc = vec2(v_uv.x, 1.0 - v_uv.y);

        // Cliff/houses sit on the RIGHT after mirror.
        float cliff = smoothstep(0.42, 0.62, sc.x) * (1.0 - smoothstep(0.56, 0.74, sc.y));
        // Water below horizon line (~0.50).
        float horizonMask = smoothstep(0.48, 0.54, sc.y);
        float water = clamp(horizonMask * (1.0 - cliff), 0.0, 1.0);

        // Depth ramps 0 (horizon) → 1 (shore foreground).
        float depth = clamp((sc.y - 0.50) / 0.45, 0.0, 1.0);
        float strength = water * depth;

        float t = u_time;

        // Layered low-amplitude displacement — visible motion, no line artifacts.
        float dx = sin(sc.y * 64.0 + t * 0.95) * 0.0014
                 + sin(sc.x * 26.0 + sc.y * 42.0 + t * 0.65) * 0.0010
                 + sin(sc.y * 150.0 + sc.x * 6.0 + t * 1.45) * 0.0005;
        float dy = sin(sc.x * 20.0 + t * 0.55) * 0.0010
                 + sin(sc.y * 88.0 + t * 1.20) * 0.0006;

        // Mirror image horizontally at sample time.
        vec2 sampleUV = vec2(1.0 - (sc.x + dx * strength), sc.y + dy * strength);
        vec3 color = texture2D(u_image, sampleUV).rgb;

        gl_FragColor = vec4(color, 1.0);
      }
    `

    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!
      gl.shaderSource(s, src)
      gl.compileShader(s)
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.error('Shader compile error:', gl.getShaderInfoLog(s))
      }
      return s
    }

    const prog = gl.createProgram()!
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, vs))
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fs))
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error('Program link error:', gl.getProgramInfoLog(prog))
      return
    }
    gl.useProgram(prog)

    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    const aPos = gl.getAttribLocation(prog, 'a_pos')
    gl.enableVertexAttribArray(aPos)
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)

    const tex = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([10, 30, 60, 255]))

    const uTime = gl.getUniformLocation(prog, 'u_time')
    const uImage = gl.getUniformLocation(prog, 'u_image')
    gl.uniform1i(uImage, 0)

    let raf = 0
    let imgReady = false
    const start = performance.now()

    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      gl.bindTexture(gl.TEXTURE_2D, tex)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img)
      imgReady = true
    }
    img.onerror = () => console.error('Failed to load /hero-beach.jpg')
    img.src = '/hero-beach.jpg'

    const resize = () => {
      const w = canvas.clientWidth, h = canvas.clientHeight
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const cw = Math.max(1, Math.round(w * dpr))
      const ch = Math.max(1, Math.round(h * dpr))
      if (canvas.width !== cw || canvas.height !== ch) {
        canvas.width = cw
        canvas.height = ch
      }
      gl.viewport(0, 0, canvas.width, canvas.height)
    }

    const tick = () => {
      if (imgReady) {
        const t = (performance.now() - start) / 1000
        gl.uniform1f(uTime, t)
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
      }
      raf = requestAnimationFrame(tick)
    }

    resize()
    tick()
    window.addEventListener('resize', resize)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
    />
  )
}
