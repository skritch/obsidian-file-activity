


/**
 * Generate an SVG sparkline from a timeseries of non-negative integers. The series
 * will be scaled such that `scale` = 100% height.
 */
export const sparklinePath = (timeseries: Array<number>, scale: number) => {
  // Scale series, and flip Y axis since (0,0) is top left.
  const adjusted = timeseries.map((x) => (scale - x/scale))
  const initSVG = "M"
  return adjusted.reduce((acc, cur, i) => {
    if (i > 0) { 
      acc = acc + "L "
    }
    return acc + i + " " + cur.toFixed(1) + " "
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
 */
export const getSparklineAsInlineStyle = (timeseries: Array<number>, scale: number) => {
  const path = sparklinePath(timeseries, scale)
  const svg = `
  <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${timeseries.length - 1} ${scale}' preserveAspectRatio='none'>
    <path
      d='${path}'
      stroke-width='1.5px'
      stroke='white'
      fill='transparent'
      vector-effect='non-scaling-stroke'
    />
  </svg>
  `
  return svgToInlineStyle(svg)
};
