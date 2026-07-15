"use client";
import { type ReactNode } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function TextField(props: {
  name: string; label: string; defaultValue?: string; type?: string; required?: boolean;
}) {
  return (
    <div className="form-group">
      <label htmlFor={props.name}>
        {props.label}{props.required && " *"}
      </label>
      <input id={props.name} name={props.name} type={props.type ?? "text"}
        defaultValue={props.defaultValue ?? ""} required={props.required} />
    </div>
  );
}

export function TextArea(props: { name: string; label: string; defaultValue?: string }) {
  return (
    <div className="form-group">
      <label htmlFor={props.name}>{props.label}</label>
      <textarea id={props.name} name={props.name} defaultValue={props.defaultValue ?? ""} />
    </div>
  );
}

export function SelectField(props: {
  name: string; label: string; options: readonly (string | number)[];
  defaultValue?: string | number; required?: boolean; placeholder?: string;
  labels?: Record<string, string>;
}) {
  const initial = props.defaultValue !== undefined && props.defaultValue !== ""
    ? String(props.defaultValue) : undefined;
  return (
    <div className="form-group">
      <label htmlFor={props.name}>
        {props.label}{props.required && " *"}
      </label>
      <Select name={props.name} defaultValue={initial} required={props.required}>
        <SelectTrigger id={props.name} className="w-full">
          <SelectValue placeholder={props.placeholder ?? "— seleziona —"} />
        </SelectTrigger>
        <SelectContent>
          {props.options.map((o) => (
            <SelectItem key={String(o)} value={String(o)}>
              {props.labels?.[String(o)] ?? String(o)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
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
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem 1rem" }}>
        {props.options.map((o) => (
          <label key={o}>
            <input name={props.name} type="checkbox" value={o} defaultChecked={selected.has(o)} />
            {" "}{o}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function Row({ children }: { children: ReactNode }) {
  return <div className="form-row">{children}</div>;
}
