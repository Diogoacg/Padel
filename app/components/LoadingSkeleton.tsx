export function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />;
}

export function MetricSkeletons() {
  return (
    <div className="metrics" aria-label="A carregar métricas">
      {Array.from({ length: 4 }).map((_, index) => (
        <div className="metric skeletonMetric" key={index}>
          <SkeletonBlock className="skeletonIcon" />
          <SkeletonBlock className="skeletonLine short" />
          <SkeletonBlock className="skeletonLine medium" />
        </div>
      ))}
    </div>
  );
}

export function CardSkeletonGrid({ count = 4 }: { count?: number }) {
  return (
    <div className="dashboardGrid" aria-label="A carregar cartões">
      {Array.from({ length: count }).map((_, index) => (
        <div className="dashboardCard skeletonCard" key={index}>
          <SkeletonBlock className="skeletonIcon" />
          <SkeletonBlock className="skeletonLine short" />
          <SkeletonBlock className="skeletonLine long" />
          <SkeletonBlock className="skeletonLine medium" />
        </div>
      ))}
    </div>
  );
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="playerList" aria-label="A carregar lista">
      {Array.from({ length: rows }).map((_, index) => (
        <div className="playerRow skeletonRow" key={index}>
          <SkeletonBlock className="skeletonAvatar" />
          <div>
            <SkeletonBlock className="skeletonLine long" />
            <SkeletonBlock className="skeletonLine medium" />
          </div>
          <SkeletonBlock className="skeletonLine tiny" />
        </div>
      ))}
    </div>
  );
}

export function GameCardSkeletons({ rows = 3 }: { rows?: number }) {
  return (
    <div className="gameCards" aria-label="A carregar jogos">
      {Array.from({ length: rows }).map((_, index) => (
        <div className="gameCard" key={index}>
          <div className="gameCardTop">
            <SkeletonBlock className="skeletonLine short" />
            <SkeletonBlock className="skeletonIcon" />
          </div>
          <div className="gameCardMain">
            <SkeletonBlock className="skeletonPanel" />
            <SkeletonBlock className="skeletonScore" />
            <SkeletonBlock className="skeletonPanel" />
          </div>
        </div>
      ))}
    </div>
  );
}
