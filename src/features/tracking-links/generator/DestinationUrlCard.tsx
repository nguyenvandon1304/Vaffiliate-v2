type Props = {
  destinationUrl: string;
};

export default function DestinationUrlCard({ destinationUrl }: Props) {
  return (
    <div className="rounded-[var(--radius-xl)] border border-[color:var(--line)] bg-[rgba(255,252,249,0.88)] p-5 shadow-[var(--shadow-sm)]">
      <p className="text-sm font-medium text-[color:var(--text-muted)]">Trang đích</p>
      <p className="mt-3 break-all rounded-2xl border border-[rgba(124,63,44,0.1)] bg-[rgba(255,250,246,0.86)] px-3 py-2 text-sm font-medium text-[color:var(--text)]">
        {destinationUrl}
      </p>
      <p className="mt-3 text-sm leading-6 text-[color:var(--text-muted)]">
        Link hoàn tiền sẽ tự động dẫn đến trang này khi người dùng truy cập. Bạn không cần chỉnh sửa URL gốc.
      </p>
    </div>
  );
}
