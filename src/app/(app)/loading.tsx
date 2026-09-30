export default function Loading() {
  return (
    <div className="flex flex-col gap-7 px-6 pt-4 lg:px-10">
      <div className="skeleton h-8 w-48 rounded-md" />
      <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-x-4 gap-y-6">
        {Array.from({ length: 12 }, (_, i) => (
          <div key={i} className="flex flex-col gap-2.5">
            <div className="skeleton aspect-video rounded-lg" />
            <div className="skeleton h-3.5 w-3/4 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
