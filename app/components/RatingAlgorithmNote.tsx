import { RATING_ALGORITHM_PARAGRAPHS } from "@/lib/rating-algorithm-copy";

export default function RatingAlgorithmNote() {
  return (
    <aside aria-label="Como funciona o rating" className="algorithmNote" id="rating-algorithm-note">
      <ul>
        {RATING_ALGORITHM_PARAGRAPHS.map((paragraph) => (
          <li key={paragraph}>{paragraph}</li>
        ))}
      </ul>
    </aside>
  );
}
