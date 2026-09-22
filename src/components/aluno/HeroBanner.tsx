import { useEffect, useState } from 'react'

const IMAGENS = [
  '/img/IMG_1201.JPG.jpeg',
  '/img/IMG_1259.jpg',
  '/img/IMG_1590.JPG.jpeg',
  '/img/IMG_1612.JPG.jpeg',
  '/img/IMG_2310.jpg',
  '/img/IMG_2389.jpg',
  '/img/IMG_2427.JPG.jpeg',
  '/img/IMG_3170.jpg',
  '/img/IMG_3233.JPG.jpeg',
  '/img/IMG_3501.jpg',
  '/img/IMG_3504.jpg',
  '/img/IMG_3609.jpg',
  '/img/IMG_3611.JPG.jpeg',
  '/img/IMG_3623.jpg',
  '/img/IMG_3771.jpg',
  '/img/IMG_3873.JPG.jpeg',
  '/img/IMG_3964.JPEG',
  '/img/IMG_4693.jpg',
  '/img/IMG_4712.jpg',
  '/img/IMG_9424.jpg',
  '/img/IMG_9758.jpg',
]

const TROCA_MS = 6000

interface HeroBannerProps {
  titulo: string
  subtitulo?: string
}

export default function HeroBanner({ titulo, subtitulo }: HeroBannerProps) {
  const [indice, setIndice] = useState(0)

  useEffect(() => {
    const id = setInterval(() => {
      setIndice((i) => (i + 1) % IMAGENS.length)
    }, TROCA_MS)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="relative h-56 md:h-72 rounded-2xl overflow-hidden shadow-lg">
      {IMAGENS.map((src, i) => (
        <img
          key={src}
          src={src}
          alt=""
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ease-in-out ${
            i === indice ? 'opacity-100' : 'opacity-0'
          }`}
        />
      ))}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-black/10" />
      <div className="relative h-full flex flex-col justify-end p-6 md:p-8">
        <h1 className="text-2xl md:text-3xl font-bold text-white drop-shadow">{titulo}</h1>
        {subtitulo && <p className="text-white/80 mt-1 text-sm md:text-base">{subtitulo}</p>}
      </div>
    </div>
  )
}
