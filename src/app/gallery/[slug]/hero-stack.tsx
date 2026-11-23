"use client";

import { motion } from "motion/react";

type Photo = { id: string; src: string; alt: string };

const POSE = [
  { rotate: -9, x: "-38%", y: 10 },
  { rotate: 7, x: "34%", y: -6 },
  { rotate: -1.5, x: "0%", y: 0 },
];

/** Three prints that drop onto the hero and fan out, the last one on top. */
export function AlbumHeroStack({ photos }: { photos: Photo[] }) {
  return (
    <div className="relative mx-auto hidden aspect-[4/3] w-full max-w-md sm:block" aria-hidden>
      {photos.map((p, i) => (
        <motion.div
          key={p.id}
          className="absolute inset-x-[22%] inset-y-0 overflow-hidden rounded-2xl border-[6px] border-white bg-white shadow-[0_24px_60px_-20px_rgb(0_0_0/0.7)]"
          initial={{ opacity: 0, y: -60, rotate: 0, x: "0%", scale: 1.08 }}
          animate={{ opacity: 1, ...POSE[i], scale: 1 }}
          whileHover={{ scale: 1.04, rotate: POSE[i].rotate * 0.5, zIndex: 10 }}
          transition={{ delay: 0.2 + i * 0.15, type: "spring", stiffness: 120, damping: 15 }}
          style={{ zIndex: i }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p.src} alt="" className="size-full object-cover" />
        </motion.div>
      ))}
    </div>
  );
}
