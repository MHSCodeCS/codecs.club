/**
 * The printed login ticket. Used as the example on the sign-in screen and,
 * later, for printing tickets from the admin roster.
 */
export function LoginTicket({
  name,
  loginCode,
  example = false,
}: {
  name: string;
  loginCode: string;
  example?: boolean;
}) {
  return (
    <div
      aria-label={example ? "Example login ticket" : `Login ticket for ${name}`}
      className="flex flex-col gap-3.5 rounded-[18px] bg-bg px-6 py-[22px] shadow-card"
    >
      <div className="flex justify-between text-xs font-extrabold tracking-[.08em] text-ink3">
        <span>LOGIN TICKET</span>
        <span className="font-mono font-medium tracking-normal">codecs.club</span>
      </div>
      <div>
        <div className="text-[13px] text-ink3">Student</div>
        <div className="text-xl font-bold">{name}</div>
      </div>
      <div className="border-t-2 border-dashed border-ln pt-3.5">
        <div className="text-[13px] text-ink3">Login code</div>
        <span className="mt-1.5 inline-block rounded-[10px] bg-mint-s2 px-3.5 py-1 font-mono text-4xl leading-[1.2] font-bold">
          {loginCode}
        </span>
      </div>
    </div>
  );
}
