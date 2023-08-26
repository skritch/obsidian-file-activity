


/**
 * Generate an SVG sparkline from a timeseries of non-negative integers. The series
 * will be flipped and scaled such that 0 => (ymax * scale), and `ymax` => 0.
 */
export const sparklinePath = (timeseries: Array<number>, scale: number) => {
  const diffs = timeseries.map((y) => scale * (Math.min(y, 3) / 3))
  const forward = diffs.reduce((acc, diff, i) => {
    return acc + "L " + scale * i + " " + (scale - diff).toFixed(1) + " "
  }, "")

  const y0 = scale.toFixed(1)
  const xf = (scale * timeseries.length).toFixed(1)
  return `M 0 ${y0} ` + forward + `L ${xf} ${y0}`
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
export const getSparklineAsInlineStyle = (timeseries: Array<number>, scale: number) => {
  const path = sparklinePath(timeseries, scale)
  const [x0, y0, dx, dy] = [-1, -1, scale * (timeseries.length - 1) + 2, scale + 2]
  const svg = `
  <svg xmlns='http://www.w3.org/2000/svg' 
      viewBox='${x0} ${y0} ${dx} ${dy}' 
      preserveAspectRatio='none'>
    <path
      d='${path}'
      stroke-width='1px'
      stroke='white'
      fill='transparent'
      
    />
  </svg>
  `
  return svgToInlineStyle(svg)
};
