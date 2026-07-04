// app/src/components/profile/fields.tsx
"use client";
import { type ReactNode } from "react";

export function TextField(props: {
  name: string; label: string; defaultValue?: string; type?: string; required?: boolean;
}) {
  return (
    <label>
      {props.label}{props.required && " *"}
      <input name={props.name} type={props.type ?? "text"}
        defaultValue={props.defaultValue ?? ""} required={props.required} />
    </label>
  );
}

export function TextArea(props: { name: string; label: string; defaultValue?: string }) {
  return (
    <label>
      {props.label}
      <textarea name={props.name} defaultValue={props.defaultValue ?? ""} />
    </label>
  );
}

export function SelectField(props: {
  name: string; label: string; options: readonly (string | number)[];
  defaultValue?: string | number; required?: boolean; placeholder?: string;
  labels?: Record<string, string>;
}) {
  return (
    <label>
      {props.label}{props.required && " *"}
      <select name={props.name} defaultValue={String(props.defaultValue ?? "")} required={props.required}>
        <option value="">{props.placeholder ?? "— seleziona —"}</option>
        {props.options.map((o) => (
          <option key={String(o)} value={String(o)}>{props.labels?.[String(o)] ?? String(o)}</option>
        ))}
      </select>
    </label>
  );
}

export function CheckboxField(props: { name: string; label: string; defaultChecked?: boolean }) {
  return (
    <label>
      <input name={props.name} type="checkbox" defaultChecked={props.defaultChecked} />
      {" "}{props.label}
    </label>
  );
}

export function MultiCheckbox(props: {
  name: string; legend: string; options: readonly string[]; defaultValues?: string[];
}) {
  const selected = new Set(props.defaultValues ?? []);
  return (
    <fieldset>
      <legend>{props.legend}</legend>
      {props.options.map((o) => (
        <label key={o}>
          <input name={props.name} type="checkbox" value={o} defaultChecked={selected.has(o)} />
          {" "}{o}
        </label>
      ))}
    </fieldset>
  );
}

export function Row({ children }: { children: ReactNode }) {
  return <div>{children}</div>;
}
