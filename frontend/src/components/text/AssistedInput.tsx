import { useEffect, useId, useRef, type InputHTMLAttributes } from "react";
import {
  keyboardNeeded,
  useTextKeyboardStore,
} from "../../store/text/keyboardStore";

type Props = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "onChange" | "value" | "id"
> & { label: string; value: string; onChange: (value: string) => void };
export function AssistedInput({
  label,
  value,
  onChange,
  maxLength = 40,
  type = "text",
  ...props
}: Props) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const mode = useTextKeyboardStore((s) => s.mode),
    hardware = useTextKeyboardStore((s) => s.hardwareObserved);
  useEffect(() => {
    useTextKeyboardStore.getState().sync(id, value);
  }, [id, value]);
  useEffect(
    () => () => {
      if (useTextKeyboardStore.getState().session?.id === id)
        useTextKeyboardStore.getState().close();
    },
    [id],
  );
  const open = (force = false) =>
    useTextKeyboardStore.getState().open(
      {
        id,
        label,
        value,
        initial: value,
        maxLength,
        secret: type === "password",
        onChange,
        returnFocus: input.current,
      },
      force,
    );
  return (
    <label className="assisted-field" htmlFor={id}>
      <span>{label}</span>
      <span className="assisted-input-row">
        <input
          {...props}
          id={id}
          ref={input}
          aria-label={label}
          data-controller-text
          type={type}
          value={value}
          maxLength={maxLength}
          inputMode={
            keyboardNeeded(mode, hardware)
              ? "none"
              : (props.inputMode ?? "text")
          }
          onClick={() => open()}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
        <button
          type="button"
          className="menu-control"
          aria-label={`Open keyboard for ${label}`}
          onClick={() => open(true)}
        >
          KEYBOARD
        </button>
      </span>
    </label>
  );
}
