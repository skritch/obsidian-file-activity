


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
  // To set a theme-dependent color: -webkit-mask-image + background color?
  // but this masks all the text...
  return `-webkit-mask-image:url("data:image/svg+xml,${shortSvg}");`
}

export const getSparklineAsInlineStyle = (timeseries: Array<number>, scale: number) => {
  const path = sparklinePath(timeseries, scale)
  const svg = `
  <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${timeseries.length - 1} ${scale}' preserveAspectRatio='none'>
    <path
      d='${path}'
      stroke-width='2'
      stroke='white'
      fill='transparent'
      vector-effect='non-scaling-stroke'
    />
  </svg>
  `
  return svgToInlineStyle(svg)
};
