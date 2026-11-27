// Original line drawings. Only these fixed paths enter the creative as artwork.
const shorts = '<path d="M45 37Q146 48 248 37L256 59Q148 74 37 59Z M37 59L16 207Q61 226 122 225L147 149L169 225Q224 227 274 205L256 59 M44 68Q48 96 28 117 M250 68Q246 98 262 116 M19 193Q64 211 124 212 M166 213Q220 214 271 192 M144 57C119 21 101 61 144 57C173 24 184 59 144 57 M144 57Q126 80 128 99 M144 57Q161 78 157 95"/><path d="m61 43-2 13m22-12-1 13m22-12-1 13m85-12 1 13m20-14 2 13m20-16 2 13"/>';
const ball='<circle cx="146" cy="131" r="90"/><path d="m146 94 36 26-14 42h-44l-14-42z M146 94V57l-27-12 M182 120l35-10 10 15 M168 162l20 32-12 22 M124 162l-22 31-24-5 M110 120l-33-12-14-21 M152 57l30-10 M216 112l-6-36 M190 192l25-12 M104 194l8 20 M77 109l-16 28"/>';
const book='<path d="M36 67Q92 46 144 77Q202 43 255 67v137q-54-21-111 8-55-29-108-7z M144 78v133 M56 89q34-10 65 4 M56 113q33-8 65 5 M169 91q35-16 65-6 M169 114q34-15 64-6"/>';
const note='<rect x="61" y="48" width="148" height="169" rx="13"/><path d="M89 92h89 M89 119h57 M89 146h39 M145 181l6-25 72-79 17 16-74 80z M150 155l16 16 M221 79l16 15"/>';
export function illustrationFor(text){
 const drawing=/\b(shorts?|waistbands?|size tag|fit check|check the fit)\b/i.test(text)?shorts:
  /\b(play|park|ball|sport|game)\b/i.test(text)?ball:
  /\b(read|book|story|learn|school)\b/i.test(text)?book:note;
 return '<svg viewBox="0 0 290 260" aria-hidden="true"><g transform="rotate(6 145 130)" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">'+drawing+'</g></svg>';
}
