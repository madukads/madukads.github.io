// Os fundos animados dos temas: shaders adaptados do React Bits
// (reactbits.dev — Aurora, Galaxy, Dark Veil e Light Rays).
//
// Os componentes originais são feitos para landing page: 60+ quadros por
// segundo, resolução cheia, sem parar nunca e seguindo o mouse. No Fence isso
// seria um problema: o app fica aberto do lado do jogo, e a GPU que desenha o
// fundo é a mesma que codifica a tela transmitida. Então aqui cada fundo:
//
//   - roda a no máximo 30 quadros, numa fração da resolução (são imagens
//     suaves; a diferença não aparece, o custo cai 4x ou mais)
//   - PARA com a janela sem foco (jogo na frente), com a aba escondida e
//     enquanto você transmite a tela — o último quadro fica parado ali
//   - com "menos movimento" no sistema, desenha um quadro só
//   - sem WebGL2, não desenha nada: o CSS cai no fundo de cor do tema
//
// Um executor só para todos: um triângulo que cobre a tela e um fragment
// shader por fundo.

const VERT = `#version 300 es
in vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }
`;

// Ruído simplex 2D (o mesmo do Aurora)
const SNOISE = `
vec3 permute(vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m; m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}
`;

const CABECA = `#version 300 es
precision highp float;
uniform float uTime;
uniform vec2 uResolution;
uniform vec3 uCor1;
uniform vec3 uCor2;
uniform vec3 uCor3;
out vec4 fragColor;
`;

/**
 * Cada fundo: o shader, a fração da resolução em que roda e a velocidade.
 * As cores vêm do tema (uCor1..3), então o mesmo fundo serve a mais de um.
 */
const FUNDOS = {
  // Aurora (React Bits): cortinas de luz que ondulam no alto da tela.
  // Aqui ela desce do TOPO — o chat fica embaixo, onde a leitura precisa de
  // contraste — e ganha uma segunda camada, mais lenta, para ter profundidade.
  aurora: {
    escala: 0.35,
    frag: CABECA + SNOISE + `
vec3 rampa(float x) {
  return x < 0.5 ? mix(uCor1, uCor2, x * 2.0) : mix(uCor2, uCor3, (x - 0.5) * 2.0);
}
float cortina(vec2 uv, float t, float amp, float desloc) {
  float altura = exp(snoise(vec2(uv.x * 1.6 + t * 0.1 + desloc, t * 0.22 + desloc)) * 0.5 * amp);
  // como no original: a luz cresce para o alto da tela
  return 0.6 * (uv.y * 2.0 - altura + 0.2);
}
void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  float t = uTime;
  vec3 cor = rampa(uv.x);
  float a = cortina(uv, t, 1.0, 0.0);
  float b = cortina(uv, t * 0.6, 1.3, 7.3);
  float alfaA = smoothstep(0.1, 0.45, a);
  float alfaB = smoothstep(0.15, 0.6, b) * 0.5;
  vec3 col = cor * alfaA * clamp(a, 0.0, 1.1) + rampa(1.0 - uv.x) * alfaB * clamp(b, 0.0, 0.9);
  // raios verticais finos, como na aurora de verdade
  float raios = 0.75 + 0.25 * snoise(vec2(uv.x * 40.0, t * 0.3));
  col *= raios;
  fragColor = vec4(col, 1.0);
}
`,
  },

  // Galaxy (React Bits): quatro camadas de estrelas que se aproximam devagar,
  // com cintilar e brilho em cruz nas maiores. Sem o mouse empurrando as
  // estrelas — num app de chat isso só distrai.
  galaxia: {
    escala: 0.6,
    frag: CABECA + `
#define NUM_LAYER 4.0
#define MAT45 mat2(0.7071, -0.7071, 0.7071, 0.7071)
float Hash21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float tri(float x) { return abs(fract(x) * 2.0 - 1.0); }
float tris(float x) { float t = fract(x); return 1.0 - smoothstep(0.0, 1.0, abs(2.0 * t - 1.0)); }
float trisn(float x) { float t = fract(x); return 2.0 * (1.0 - smoothstep(0.0, 1.0, abs(2.0 * t - 1.0))) - 1.0; }
float Star(vec2 uv, float flare) {
  float d = length(uv);
  float m = (0.05 * 0.35) / d;
  float rays = smoothstep(0.0, 1.0, 1.0 - abs(uv.x * uv.y * 1000.0));
  m += rays * flare * 0.35;
  uv *= MAT45;
  rays = smoothstep(0.0, 1.0, 1.0 - abs(uv.x * uv.y * 1000.0));
  m += rays * 0.3 * flare * 0.35;
  m *= smoothstep(1.0, 0.2, d);
  return m;
}
vec3 StarLayer(vec2 uv, float starSpeed) {
  vec3 col = vec3(0.0);
  vec2 gv = fract(uv) - 0.5;
  vec2 id = floor(uv);
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 offset = vec2(float(x), float(y));
      vec2 si = id + offset;
      float seed = Hash21(si);
      float size = fract(seed * 345.32);
      float flareSize = smoothstep(0.9, 1.0, size) * tri(starSpeed / (3.0 * seed + 1.0));
      // a cor da estrela sai das três do tema, sorteada por estrela
      float c = Hash21(si + 1.0);
      vec3 base = c < 0.45 ? uCor1 : (c < 0.8 ? uCor2 : uCor3);
      base = mix(vec3(1.0), base, 0.55 + 0.45 * Hash21(si + 3.0));
      vec2 pad = vec2(tris(seed * 34.0 + uTime / 10.0), tris(seed * 38.0 + uTime / 30.0)) - 0.5;
      float star = Star(gv - offset - pad, flareSize);
      float twinkle = mix(1.0, trisn(uTime + seed * 6.2831) * 0.5 + 1.0, 0.35);
      col += star * size * base * twinkle;
    }
  }
  return col;
}
void main() {
  vec2 uv = (gl_FragCoord.xy - uResolution * 0.5) / uResolution.y;
  float ang = uTime * 0.012;
  uv = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * uv;
  float starSpeed = uTime * 0.012;
  vec3 col = vec3(0.0);
  for (float i = 0.0; i < 1.0; i += 1.0 / NUM_LAYER) {
    float depth = fract(i + starSpeed);
    float scale = mix(20.0, 0.5, depth);
    float fade = depth * smoothstep(1.0, 0.9, depth);
    col += StarLayer(uv * scale + i * 453.32, starSpeed) * fade;
  }
  // uma nebulosa bem fraca atrás, para o fundo não ser preto chapado
  vec2 p = gl_FragCoord.xy / uResolution;
  float neb = smoothstep(0.9, 0.0, distance(p, vec2(0.78, 0.82))) * 0.10 + smoothstep(0.8, 0.0, distance(p, vec2(0.15, 0.2))) * 0.07;
  col += mix(uCor3, uCor1, p.x) * neb;
  fragColor = vec4(col, 1.0);
}
`,
  },

  // Dark Veil (React Bits): uma rede neural pequena (CPPN) pintando um véu
  // orgânico que respira. O original tem cor fixa; aqui a luminância do véu
  // é repintada com as cores do tema.
  veu: {
    escala: 0.3,
    frag: CABECA + `
vec4 buf[8];
vec4 sigmoid(vec4 x) { return 1. / (1. + exp(-x)); }
vec4 cppn_fn(vec2 coordinate, float in0, float in1, float in2) {
  buf[6] = vec4(coordinate.x, coordinate.y, 0.3948333106474662 + in0, 0.36 + in1);
  buf[7] = vec4(0.14 + in2, sqrt(coordinate.x * coordinate.x + coordinate.y * coordinate.y), 0., 0.);
  buf[0] = mat4(vec4(6.5404263,-3.6126034,0.7590882,-1.13613),vec4(2.4582713,3.1660357,1.2219609,0.06276096),vec4(-5.478085,-6.159632,1.8701609,-4.7742867),vec4(6.039214,-5.542865,-0.90925294,3.251348))*buf[6]+mat4(vec4(0.8473259,-5.722911,3.975766,1.6522468),vec4(-0.24321538,0.5839259,-1.7661959,-5.350116),vec4(0.,0.,0.,0.),vec4(0.,0.,0.,0.))*buf[7]+vec4(0.21808943,1.1243913,-1.7969975,5.0294676);
  buf[1] = mat4(vec4(-3.3522482,-6.0612736,0.55641043,-4.4719114),vec4(0.8631464,1.7432913,5.643898,1.6106541),vec4(2.4941394,-3.5012043,1.7184316,6.357333),vec4(3.310376,8.209261,1.1355612,-1.165539))*buf[6]+mat4(vec4(5.24046,-13.034365,0.009859298,15.870829),vec4(2.987511,3.129433,-0.89023495,-1.6822904),vec4(0.,0.,0.,0.),vec4(0.,0.,0.,0.))*buf[7]+vec4(-5.9457836,-6.573602,-0.8812491,1.5436668);
  buf[0] = sigmoid(buf[0]); buf[1] = sigmoid(buf[1]);
  buf[2] = mat4(vec4(-15.219568,8.095543,-2.429353,-1.9381982),vec4(-5.951362,4.3115187,2.6393783,1.274315),vec4(-7.3145227,6.7297835,5.2473326,5.9411426),vec4(5.0796127,8.979051,-1.7278991,-1.158976))*buf[6]+mat4(vec4(-11.967154,-11.608155,6.1486754,11.237008),vec4(2.124141,-6.263192,-1.7050359,-0.7021966),vec4(0.,0.,0.,0.),vec4(0.,0.,0.,0.))*buf[7]+vec4(-4.17164,-3.2281182,-4.576417,-3.6401186);
  buf[3] = mat4(vec4(3.1832156,-13.738922,1.879223,3.233465),vec4(0.64300746,12.768129,1.9141049,0.50990224),vec4(-0.049295485,4.4807224,1.4733979,1.801449),vec4(5.0039253,13.000481,3.3991797,-4.5561905))*buf[6]+mat4(vec4(-0.1285731,7.720628,-3.1425676,4.742367),vec4(0.6393625,3.714393,-0.8108378,-0.39174938),vec4(0.,0.,0.,0.),vec4(0.,0.,0.,0.))*buf[7]+vec4(-1.1811101,-21.621881,0.7851888,1.2329718);
  buf[2] = sigmoid(buf[2]); buf[3] = sigmoid(buf[3]);
  buf[4] = mat4(vec4(5.214916,-7.183024,2.7228765,2.6592617),vec4(-5.601878,-25.3591,4.067988,0.4602802),vec4(-10.57759,24.286327,21.102104,37.546658),vec4(4.3024497,-1.9625226,2.3458803,-1.372816))*buf[0]+mat4(vec4(-17.6526,-10.507558,2.2587414,12.462782),vec4(6.265566,-502.75443,-12.642513,0.9112289),vec4(-10.983244,20.741234,-9.701768,-0.7635988),vec4(5.383626,1.4819539,-4.1911616,-4.8444734))*buf[1]+mat4(vec4(12.785233,-16.345072,-0.39901125,1.7955981),vec4(-30.48365,-1.8345358,1.4542528,-1.1118771),vec4(19.872723,-7.337935,-42.941723,-98.52709),vec4(8.337645,-2.7312303,-2.2927687,-36.142323))*buf[2]+mat4(vec4(-16.298317,3.5471997,-0.44300047,-9.444417),vec4(57.5077,-35.609753,16.163465,-4.1534753),vec4(-0.07470326,-3.8656476,-7.0901804,3.1523974),vec4(-12.559385,-7.077619,1.490437,-0.8211543))*buf[3]+vec4(-7.67914,15.927437,1.3207729,-1.6686112);
  buf[5] = mat4(vec4(-1.4109162,-0.372762,-3.770383,-21.367174),vec4(-6.2103205,-9.35908,0.92529047,8.82561),vec4(11.460242,-22.348068,13.625772,-18.693201),vec4(-0.3429052,-3.9905605,-2.4626114,-0.45033523))*buf[0]+mat4(vec4(7.3481627,-4.3661838,-6.3037653,-3.868115),vec4(1.5462853,6.5488915,1.9701879,-0.58291394),vec4(6.5858274,-2.2180402,3.7127688,-1.3730392),vec4(-5.7973905,10.134961,-2.3395722,-5.965605))*buf[1]+mat4(vec4(-2.5132585,-6.6685553,-1.4029363,-0.16285264),vec4(-0.37908727,0.53738135,4.389061,-1.3024765),vec4(-0.70647055,2.0111287,-5.1659346,-3.728635),vec4(-13.562562,10.487719,-0.9173751,-2.6487076))*buf[2]+mat4(vec4(-8.645013,6.5546675,-6.3944063,-5.5933375),vec4(-0.57783127,-1.077275,36.91025,5.736769),vec4(14.283112,3.7146652,7.1452246,-4.5958776),vec4(2.7192075,3.6021907,-4.366337,-2.3653464))*buf[3]+vec4(-5.9000807,-4.329569,1.2427121,8.59503);
  buf[4] = sigmoid(buf[4]); buf[5] = sigmoid(buf[5]);
  buf[6] = mat4(vec4(-1.61102,0.7970257,1.4675229,0.20917463),vec4(-28.793737,-7.1390953,1.5025433,4.656581),vec4(-10.94861,39.66238,0.74318546,-10.095605),vec4(-0.7229728,-1.5483948,0.7301322,2.1687684))*buf[0]+mat4(vec4(3.2547753,21.489103,-1.0194173,-3.3100595),vec4(-3.7316632,-3.3792162,-7.223193,-0.23685838),vec4(13.1804495,0.7916005,5.338587,5.687114),vec4(-4.167605,-17.798311,-6.815736,-1.6451967))*buf[1]+mat4(vec4(0.604885,-7.800309,-7.213122,-2.741014),vec4(-3.522382,-0.12359311,-0.5258442,0.43852118),vec4(9.6752825,-22.853785,2.062431,0.099892326),vec4(-4.3196306,-17.730087,2.5184598,5.30267))*buf[2]+mat4(vec4(-6.545563,-15.790176,-6.0438633,-5.415399),vec4(-43.591583,28.551912,-16.00161,18.84728),vec4(4.212382,8.394307,3.0958717,8.657522),vec4(-5.0237565,-4.450633,-4.4768,-5.5010443))*buf[3]+mat4(vec4(1.6985557,-67.05806,6.897715,1.9004834),vec4(1.8680354,2.3915145,2.5231109,4.081538),vec4(11.158006,1.7294737,2.0738268,7.386411),vec4(-4.256034,-306.24686,8.258898,-17.132736))*buf[4]+mat4(vec4(1.6889864,-4.5852966,3.8534803,-6.3482175),vec4(1.3543309,-1.2640043,9.932754,2.9079645),vec4(-5.2770967,0.07150358,-0.13962056,3.3269649),vec4(28.34703,-4.918278,6.1044083,4.085355))*buf[5]+vec4(6.6818056,12.522166,-3.7075126,-4.104386);
  buf[7] = mat4(vec4(-8.265602,-4.7027016,5.098234,0.7509808),vec4(8.6507845,-17.15949,16.51939,-8.884479),vec4(-4.036479,-2.3946867,-2.6055532,-1.9866527),vec4(-2.2167742,-1.8135649,-5.9759874,4.8846445))*buf[0]+mat4(vec4(6.7790847,3.5076547,-2.8191125,-2.7028968),vec4(-5.743024,-0.27844876,1.4958696,-5.0517144),vec4(13.122226,15.735168,-2.9397483,-4.101023),vec4(-14.375265,-5.030483,-6.2599335,2.9848232))*buf[1]+mat4(vec4(4.0950394,-0.94011575,-5.674733,4.755022),vec4(4.3809423,4.8310084,1.7425908,-3.437416),vec4(2.117492,0.16342592,-104.56341,16.949184),vec4(-5.22543,-2.994248,3.8350096,-1.9364246))*buf[2]+mat4(vec4(-5.900337,1.7946124,-13.604192,-3.8060522),vec4(6.6583457,31.911177,25.164474,91.81147),vec4(11.840538,4.1503043,-0.7314397,6.768467),vec4(-6.3967767,4.034772,6.1714606,-0.32874924))*buf[3]+mat4(vec4(3.4992442,-196.91893,-8.923708,2.8142626),vec4(3.4806502,-3.1846354,5.1725626,5.1804223),vec4(-2.4009497,15.585794,1.2863957,2.0252278),vec4(-71.25271,-62.441242,-8.138444,0.50670296))*buf[4]+mat4(vec4(-12.291733,-11.176166,-7.3474145,4.390294),vec4(10.805477,5.6337385,-0.9385842,-4.7348723),vec4(-12.869276,-7.039391,5.3029537,7.5436664),vec4(1.4593618,8.91898,3.5101583,5.840625))*buf[5]+vec4(2.2415268,-6.705987,-0.98861027,-2.117676);
  buf[6] = sigmoid(buf[6]); buf[7] = sigmoid(buf[7]);
  buf[0] = mat4(vec4(1.6794263,1.3817469,2.9625452,0.),vec4(-1.8834411,-1.4806935,-3.5924516,0.),vec4(-1.3279216,-1.0918057,-2.3124623,0.),vec4(0.2662234,0.23235129,0.44178495,0.))*buf[0]+mat4(vec4(-0.6299101,-0.5945583,-0.9125601,0.),vec4(0.17828953,0.18300213,0.18182953,0.),vec4(-2.96544,-2.5819945,-4.9001055,0.),vec4(1.4195864,1.1868085,2.5176322,0.))*buf[1]+mat4(vec4(-1.2584374,-1.0552157,-2.1688404,0.),vec4(-0.7200217,-0.52666044,-1.438251,0.),vec4(0.15345335,0.15196142,0.272854,0.),vec4(0.945728,0.8861938,1.2766753,0.))*buf[2]+mat4(vec4(-2.4218085,-1.968602,-4.35166,0.),vec4(-22.683098,-18.0544,-41.954372,0.),vec4(0.63792,0.5470648,1.1078634,0.),vec4(-1.5489894,-1.3075932,-2.6444845,0.))*buf[3]+mat4(vec4(-0.49252132,-0.39877754,-0.91366625,0.),vec4(0.95609266,0.7923952,1.640221,0.),vec4(0.30616966,0.15693925,0.8639857,0.),vec4(1.1825981,0.94504964,2.176963,0.))*buf[4]+mat4(vec4(0.35446745,0.3293795,0.59547555,0.),vec4(-0.58784515,-0.48177817,-1.0614829,0.),vec4(2.5271258,1.9991658,4.6846647,0.),vec4(0.13042648,0.08864098,0.30187556,0.))*buf[5]+mat4(vec4(-1.7718065,-1.4033192,-3.3355875,0.),vec4(3.1664357,2.638297,5.378702,0.),vec4(-3.1724713,-2.6107926,-5.549295,0.),vec4(-2.851368,-2.249092,-5.3013067,0.))*buf[6]+mat4(vec4(1.5203838,1.2212278,2.8404984,0.),vec4(1.5210563,1.2651345,2.683903,0.),vec4(2.9789467,2.4364579,5.2347264,0.),vec4(2.2270417,1.8825914,3.8028636,0.))*buf[7]+vec4(-1.5468478,-3.6171484,0.24762098,0.);
  buf[0] = sigmoid(buf[0]);
  return vec4(buf[0].x, buf[0].y, buf[0].z, 1.);
}
void main() {
  vec2 uv = gl_FragCoord.xy / uResolution.xy * 2. - 1.;
  uv.x *= uResolution.x / uResolution.y;
  uv.y *= -1.;
  uv += 0.35 * vec2(sin(uv.y * 6.283 + uTime * 0.5), cos(uv.x * 6.283 + uTime * 0.5)) * 0.05;
  vec3 c = cppn_fn(uv, 0.1 * sin(0.3 * uTime), 0.1 * sin(0.69 * uTime), 0.1 * sin(0.44 * uTime)).rgb;
  // O véu original é azul-violeta: a forma está na intensidade (o canal mais
  // forte — a luminância quase zera no azul) e a mistura de vermelho/azul
  // decide qual das duas cores do tema pinta cada pedaço.
  float e = max(c.r, max(c.g, c.b));
  float k = smoothstep(0.25, 0.75, c.r / (c.b + 0.001));
  vec3 cor = mix(uCor3, mix(uCor1, uCor2, k), smoothstep(0.05, 0.6, e));
  fragColor = vec4(cor * e * 1.05, 1.0);
}
`,
  },

  // Light Rays (React Bits): feixes de luz caindo do alto, como vitral de
  // catedral. Dois leques com sementes diferentes para os feixes não
  // pulsarem juntos. Sem seguir o mouse.
  raios: {
    escala: 0.35,
    frag: CABECA + `
float forca(vec2 origem, vec2 dir, vec2 coord, float sA, float sB, float vel) {
  vec2 d = coord - origem;
  float cosA = dot(normalize(d), dir);
  float espalha = pow(max(cosA, 0.0), 1.0 / 0.9);
  float dist = length(d);
  float maxD = uResolution.x * 1.6;
  float queda = clamp((maxD - dist) / maxD, 0.0, 1.0);
  float some = clamp((uResolution.x * 1.1 - dist) / (uResolution.x * 1.1), 0.5, 1.0);
  float base = clamp((0.45 + 0.15 * sin(cosA * sA + uTime * vel)) + (0.3 + 0.2 * cos(-cosA * sB + uTime * vel)), 0.0, 1.0);
  return base * queda * some * espalha;
}
void main() {
  vec2 coord = vec2(gl_FragCoord.x, uResolution.y - gl_FragCoord.y);
  vec2 origem = vec2(0.5 * uResolution.x, -0.2 * uResolution.y);
  float r1 = forca(origem, vec2(0.0, 1.0), coord, 36.2214, 21.11349, 1.5 * 0.35);
  float r2 = forca(origem, vec2(0.0, 1.0), coord, 22.3991, 18.0234, 1.1 * 0.35);
  float v = r1 * 0.5 + r2 * 0.4;
  float y = coord.y / uResolution.y;
  // perto da fonte, a cor clara; longe, a cor do tema
  vec3 cor = mix(uCor1, uCor2, smoothstep(0.0, 0.8, y));
  vec3 col = cor * v * (1.0 - y * 0.75);
  // poeira no feixe
  float p = fract(sin(dot(floor(coord * 0.5) + floor(uTime * 8.0), vec2(12.9898, 78.233))) * 43758.5453);
  col += uCor3 * step(0.9985, p) * v * 1.4;
  fragColor = vec4(col, 1.0);
}
`,
  },

  // ——— Os fundos de terror (feitos para o Fence, não do React Bits). Todos
  // escuros de verdade: o brilho mora no alto e nos cantos, o chat embaixo
  // continua legível. Mesmo executor, mesmo teto de 30 quadros.

  // Vigília: pares de olhos que acendem no escuro, piscam, acompanham o centro
  // da tela e somem. Cada célula da grade tem o seu relógio, então nunca
  // acendem todos juntos. uCor1 = brilho do olho, uCor2 = miolo, uCor3 = névoa.
  olhos: {
    escala: 0.5,
    frag: CABECA + SNOISE + `
float h21(vec2 p) { p = fract(p * vec2(233.34, 851.73)); p += dot(p, p + 23.45); return fract(p.x * p.y); }
float olho(vec2 q, float abre) {
  // amêndoa achatada; a pálpebra fecha encolhendo o y
  q.y /= max(abre, 0.02);
  return length(q * vec2(1.0, 2.3)) - 0.075;
}
void main() {
  vec2 uv = gl_FragCoord.xy / uResolution.y;
  float t = uTime;
  vec2 g = uv * 4.2;
  vec2 meio = vec2(uResolution.x / uResolution.y, 1.0) * 0.5 * 4.2;
  vec3 col = vec3(0.0);
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 id = floor(g) + vec2(float(x), float(y));
    if (h21(id) > 0.42) continue; // a maioria das células fica vazia
    float periodo = 9.0 + 9.0 * h21(id + 7.1);
    float vida = fract(t / periodo + h21(id + 3.3));
    float aparece = smoothstep(0.0, 0.06, vida) * (1.0 - smoothstep(0.30, 0.38, vida));
    if (aparece <= 0.0) continue;
    float abre = 1.0 - exp(-pow((vida - 0.17) * 90.0, 2.0)); // uma piscada no meio
    vec2 centro = id + vec2(0.25 + 0.5 * h21(id + 1.7), 0.3 + 0.4 * h21(id + 5.9));
    vec2 q = g - centro;
    float lado = 0.13 + 0.05 * h21(id + 9.2);
    float d = min(olho(q - vec2(lado, 0.0), abre), olho(q + vec2(lado, 0.0), abre));
    // pupila em fenda, olhando para o meio da tela
    vec2 mira = normalize(meio - centro + 0.001) * 0.018;
    float px = abs(q.x) - lado - mira.x * sign(q.x);
    float pupila = smoothstep(0.012, 0.004, abs(px)) * step(d, 0.0);
    float corpo = smoothstep(0.004, -0.004, d);
    float brilho = exp(-max(d, 0.0) * 38.0) * 0.55;
    vec3 c = mix(uCor1, uCor2, smoothstep(0.0, -0.05, d)) * corpo * (1.0 - pupila * 0.95) + uCor1 * brilho;
    col += c * aparece;
  }
  float y01 = gl_FragCoord.y / uResolution.y;
  float n = snoise(vec2(uv.x * 1.3 + t * 0.03, uv.y * 2.0 - t * 0.02)) * 0.5 + 0.5;
  col += uCor3 * n * (1.0 - smoothstep(0.0, 0.7, y01)) * 0.9;
  col *= 0.35 + 0.65 * smoothstep(0.05, 0.6, y01);
  fragColor = vec4(col, 1.0);
}
`,
  },

  // Visceral: veias que batem como um coração (tum-tum… tum-tum) num fundo de
  // carne escura. Ruído "cordilheira" com o domínio torcido dá os fios.
  veias: {
    escala: 0.35,
    frag: CABECA + SNOISE + `
float cordilheira(vec2 p) { return 1.0 - abs(snoise(p)); }
void main() {
  vec2 uv = gl_FragCoord.xy / uResolution.y;
  vec2 p01 = gl_FragCoord.xy / uResolution;
  float t = uTime;
  vec2 w = vec2(snoise(uv * 1.2 + t * 0.02), snoise(uv * 1.2 - t * 0.017 + 4.0)) * 0.35;
  float v = pow(cordilheira(uv * 2.2 + w), 14.0) + 0.55 * pow(cordilheira(uv * 5.1 - w * 1.7 + 9.0), 18.0);
  float x = fract(t * 0.8);
  float pulso = exp(-pow(x * 9.0, 2.0)) + 0.65 * exp(-pow((x - 0.24) * 9.0, 2.0));
  float vinh = smoothstep(1.15, 0.2, distance(p01, vec2(0.5, 0.75)));
  vec3 carne = uCor3 * (0.6 + 0.4 * snoise(uv * 3.0 + 2.0));
  vec3 col = carne + mix(uCor2, uCor1, pulso) * v * (0.35 + 0.9 * pulso);
  col *= vinh;
  col *= 0.4 + 0.6 * smoothstep(0.0, 0.55, p01.y);
  fragColor = vec4(col, 1.0);
}
`,
  },

  // Cinzas: névoa pesada arrastando e cinza caindo, cidade abandonada. De vez
  // em quando uma brasa (uCor2) cai no meio da cinza.
  nevoa: {
    escala: 0.4,
    frag: CABECA + SNOISE + `
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * snoise(p); p *= 2.03; a *= 0.5; } return s; }
float cinza(vec2 uv, float esc, float vel, float t, out float brasa) {
  vec2 g = uv * esc;
  g.y += t * vel;
  g.x += sin(g.y * 0.7 + t * 0.4) * 0.3;
  vec2 id = floor(g);
  vec2 f = fract(g) - 0.5;
  float s = h21(id);
  brasa = step(0.985, s);
  vec2 off = vec2(h21(id + 2.0), h21(id + 4.0)) - 0.5;
  return smoothstep(0.06, 0.0, length(f - off * 0.7)) * step(0.55, s);
}
void main() {
  vec2 uv = gl_FragCoord.xy / uResolution.y;
  vec2 p01 = gl_FragCoord.xy / uResolution;
  float t = uTime;
  float f1 = fbm(vec2(uv.x * 1.1 - t * 0.035, uv.y * 1.6)) * 0.5 + 0.5;
  float f2 = fbm(vec2(uv.x * 2.3 + t * 0.05, uv.y * 2.1 + 3.0)) * 0.5 + 0.5;
  float neb = smoothstep(0.35, 0.95, f1 * 0.7 + f2 * 0.45);
  vec3 col = mix(uCor3, uCor1, neb * 0.55);
  float b1;
  float b2;
  float c1 = cinza(uv, 9.0, -0.35, t, b1);
  float c2 = cinza(uv + 5.0, 16.0, -0.22, t, b2);
  col += mix(uCor1 * 1.3, uCor2, b1) * c1 * (0.5 + b1) + uCor1 * c2 * 0.35;
  col *= smoothstep(1.3, 0.3, distance(p01, vec2(0.5, 0.6)));
  col *= 0.45 + 0.55 * smoothstep(0.0, 0.5, p01.y);
  fragColor = vec4(col, 1.0);
}
`,
  },

  // Sinal Perdido: fita VHS que não devia existir. Chiado, varredura, uma faixa
  // rolando devagar e, de vez em quando, o sinal falha: as linhas escorregam e
  // a cor de alerta (uCor2) vaza.
  estatica: {
    escala: 0.5,
    frag: CABECA + SNOISE + `
// hash sem seno: com sin() em coordenada grande o chiado vira listra diagonal
float h11(float n) { n = fract(n * 0.1031); n *= n + 33.33; n *= n + n; return fract(n); }
float h21(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
void main() {
  vec2 p01 = gl_FragCoord.xy / uResolution;
  float t = uTime;
  float quadro = floor(t * 24.0);
  float falha = step(0.93, h11(floor(t * 3.0)));
  float linha = floor(gl_FragCoord.y / 3.0);
  float desliza = falha * (h11(linha + quadro) - 0.5) * 0.08 * step(0.6, h11(linha * 0.37 + quadro));
  vec2 q = vec2(p01.x + desliza, p01.y);
  float grao = h21(floor(q * uResolution) + quadro);
  float varre = 0.78 + 0.22 * sin(gl_FragCoord.y * 3.14159);
  float faixa = smoothstep(0.08, 0.0, abs(fract(p01.y + t * 0.06) - 0.5) - 0.02);
  float forma = snoise(vec2(q.x * 3.0, q.y * 2.0 + t * 0.05)) * 0.5 + 0.5;
  // barras de "tracking" rasgando o pé da imagem, como fita gasta
  float trilha = step(0.985, h21(vec2(linha, floor(t * 12.0)))) * smoothstep(0.35, 0.0, p01.y);
  vec3 col = uCor3 + uCor1 * (grao * 0.09 + faixa * 0.16 + forma * 0.06 + trilha * grao * 0.5);
  col += uCor2 * falha * (grao * 0.22 + 0.04);
  col *= varre;
  col *= smoothstep(1.2, 0.35, distance(p01, vec2(0.5)));
  col *= 0.5 + 0.5 * smoothstep(0.0, 0.5, p01.y);
  fragColor = vec4(col, 1.0);
}
`,
  },
};

export const FUNDOS_VIVOS = new Set(Object.keys(FUNDOS));

const hex = (h) => {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(h || '');
  return m ? [1, 2, 3].map((i) => parseInt(m[i], 16) / 255) : [1, 1, 1];
};

function compilar(gl, tipo, fonte) {
  const s = gl.createShader(tipo);
  gl.shaderSource(s, fonte);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.warn('[fundo] shader:', gl.getShaderInfoLog(s));
    gl.deleteShader(s);
    return null;
  }
  return s;
}

/**
 * Liga um fundo num canvas. Devolve { pausar(bool), parar() }.
 * `cores`: três hex, do tema. `reduzido`: um quadro só, parado.
 * `onPerdido`: o contexto WebGL caiu sem ninguém pedir (o Chromium derruba o
 * mais antigo quando a página passa de 16) — o canvas fica em branco e quem
 * chamou tem de montar outro.
 */
export function tocarFundo(canvas, id, { cores = [], reduzido = false, onPerdido = null } = {}) {
  const def = FUNDOS[id];
  const gl = def && canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'low-power', preserveDrawingBuffer: false });
  const nada = { pausar() {}, parar() {} };
  if (!gl) return nada;

  const vs = compilar(gl, gl.VERTEX_SHADER, VERT);
  const fs = compilar(gl, gl.FRAGMENT_SHADER, def.frag);
  if (!vs || !fs) return nada;
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return nada;
  gl.useProgram(prog);

  // um triângulo que passa das bordas cobre a tela inteira
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const pos = gl.getAttribLocation(prog, 'position');
  gl.enableVertexAttribArray(pos);
  gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);

  const u = (n) => gl.getUniformLocation(prog, n);
  const uTime = u('uTime');
  const uRes = u('uResolution');
  ['uCor1', 'uCor2', 'uCor3'].forEach((n, i) => gl.uniform3fv(u(n), hex(cores[i] || cores[0])));

  const medir = () => {
    const w = Math.max(1, Math.round(canvas.clientWidth * def.escala));
    const h = Math.max(1, Math.round(canvas.clientHeight * def.escala));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl.viewport(0, 0, w, h);
    gl.uniform2f(uRes, w, h);
  };

  // O tempo começa num ponto sorteado: abrir o app não mostra sempre o mesmo
  // quadro, e o modo parado não fica preso num frame vazio do início.
  let t = 20 + Math.random() * 200;
  const desenhar = () => {
    medir();
    gl.uniform1f(uTime, t);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  let pausado = false;
  // parado, o quadro é redesenhado só quando o tamanho muda
  const obs = new ResizeObserver(() => { if (pausado || reduzido) desenhar(); });
  obs.observe(canvas);

  let quadro = 0;
  let antes = 0;
  const INTERVALO = 1000 / 30;
  const loop = (agora) => {
    quadro = requestAnimationFrame(loop);
    if (agora - antes < INTERVALO - 2) return;
    t += Math.min(0.1, (agora - (antes || agora)) / 1000);
    antes = agora;
    desenhar();
  };
  const ligar = () => {
    if (quadro || reduzido) return;
    antes = 0;
    quadro = requestAnimationFrame(loop);
  };
  const desligar = () => {
    cancelAnimationFrame(quadro);
    quadro = 0;
  };

  const perdeu = (e) => {
    e.preventDefault();
    desligar();
    onPerdido?.();
  };
  canvas.addEventListener('webglcontextlost', perdeu);

  desenhar();
  if (!reduzido) ligar();

  return {
    pausar(sim) {
      pausado = !!sim;
      if (pausado) desligar();
      else ligar();
    },
    parar() {
      desligar();
      obs.disconnect();
      // antes de perder de propósito, senão parecia uma queda de verdade
      canvas.removeEventListener('webglcontextlost', perdeu);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}
