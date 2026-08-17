"""Genera los iconos PNG de la app sin dependencias externas.

El icono es el anillo de progreso: la marca de la app es su objeto central,
no un logotipo aparte. Fondo rosa profundo (el acento del sistema), pista del
anillo en blanco al 28 % y un arco de tres cuartos en blanco sólido.

Uso:  python herramientas/iconos.py
"""

import math
import os
import struct
import zlib

MARCA = (143, 32, 116)      # oklch(0.455 0.170 340) pasado a sRGB
BLANCO = (255, 255, 255)
SALIDA = os.path.join(os.path.dirname(__file__), '..', 'iconos')


def mezclar(fondo, frente, alfa):
    return tuple(round(f * (1 - alfa) + d * alfa) for f, d in zip(fondo, frente))


def dibujar(tam, proporcion_anillo, supermuestreo):
    """Devuelve una lista de filas de píxeles RGB."""
    n = tam * supermuestreo
    centro = n / 2
    radio = n * proporcion_anillo / 2
    grosor = radio * 0.30
    dentro, fuera = radio - grosor / 2, radio + grosor / 2

    # El arco arranca arriba y recorre tres cuartos en el sentido del reloj.
    inicio, barrido = -math.pi / 2, math.pi * 1.5

    filas = []
    for y in range(tam):
        fila = bytearray()
        for x in range(tam):
            acumulado = [0.0, 0.0, 0.0]
            for sy in range(supermuestreo):
                for sx in range(supermuestreo):
                    px = x * supermuestreo + sx + 0.5
                    py = y * supermuestreo + sy + 0.5
                    d = math.hypot(px - centro, py - centro)

                    color = MARCA
                    if dentro <= d <= fuera:
                        angulo = (math.atan2(py - centro, px - centro) - inicio) % (2 * math.pi)
                        color = mezclar(MARCA, BLANCO, 1.0 if angulo <= barrido else 0.28)
                    for i in range(3):
                        acumulado[i] += color[i]
            total = supermuestreo * supermuestreo
            fila.extend(round(c / total) for c in acumulado)
        filas.append(bytes(fila))
    return filas


def escribir_png(ruta, filas, ancho):
    crudo = b''.join(b'\x00' + fila for fila in filas)

    def trozo(tipo, datos):
        return (struct.pack('>I', len(datos)) + tipo + datos
                + struct.pack('>I', zlib.crc32(tipo + datos) & 0xFFFFFFFF))

    png = (b'\x89PNG\r\n\x1a\n'
           + trozo(b'IHDR', struct.pack('>IIBBBBB', ancho, len(filas), 8, 2, 0, 0, 0))
           + trozo(b'IDAT', zlib.compress(crudo, 9))
           + trozo(b'IEND', b''))
    with open(ruta, 'wb') as f:
        f.write(png)


def main():
    os.makedirs(SALIDA, exist_ok=True)
    trabajos = [
        ('icono-180.png', 180, 0.62, 3),
        ('icono-192.png', 192, 0.62, 3),
        ('icono-512.png', 512, 0.62, 2),
        # El "maskable" se recorta en círculo en Android: el dibujo se encoge
        # para caber en la zona segura del 80 %.
        ('icono-maskable-512.png', 512, 0.48, 2),
    ]
    for nombre, tam, proporcion, muestreo in trabajos:
        filas = dibujar(tam, proporcion, muestreo)
        escribir_png(os.path.join(SALIDA, nombre), filas, tam)
        print(f'  {nombre}  {tam}x{tam}')


if __name__ == '__main__':
    main()
