


/**
 * Generate an SVG sparkline from a timeseries of non-negative integers. The series
 * will be flipped and scaled such that 0 => (ymax * scale), and `ymax` => 0.
 */
export const sparklinePath = (timeseries: Array<number>, ymax: number, scale: number) => {
  const adjusted = timeseries.map((y) => scale * (1 - y/ymax))
  const initSVG = "M "
  return adjusted.reduce((acc, cur, i) => {
    if (i > 0) { 
      acc = acc + "L "
    }
    return acc + scale * i + " " + cur.toFixed(1) + " "
  }, initSVG)
};


const svgToInlineStyle = (svg: string) => {
  const shortSvg = svg.replace(/\s+/g,' ')
  return `-webkit-mask-image:url("data:image/svg+xml,${shortSvg}");`
}

/**
 * Generate a sparkline graph for the timeseries as a SVG applied as a 
 * "mask" over a background color. This works around two limitations
 * - can't create SVG elements directly
 * - just using "backgruond-image" directly prevents us from styling the inline
 *   SVG with CSS vars, but it works to use the SVG as a mask over a CSS-determined
 *   background color.
 * 
 * `scale` sets the size of the whole SVG coordinate system, in case it causes issues.
 */
export const getSparklineAsInlineStyle = (timeseries: Array<number>, ymax: number, scale: number) => {
  const path = sparklinePath(timeseries, ymax, scale)
  const [x0, y0, dx, dy] = [0, 0, scale * (timeseries.length - 1), scale * ymax]
  const svg = `
  <svg xmlns='http://www.w3.org/2000/svg' viewBox='${x0 - scale} ${y0 - scale} ${dx + scale * 2} ${dy + scale * 2}' preserveAspectRatio='none'>
    <path
      d='${path}'
      stroke-width='1.5px'
      stroke='white'
      fill='transparent'
    />
  </svg>
  `
  return svgToInlineStyle(svg)
};
