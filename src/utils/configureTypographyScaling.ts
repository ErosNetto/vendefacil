import React from 'react';
import { Text, TextInput } from 'react-native';
import * as jsxDevRuntime from 'react/jsx-dev-runtime';
import * as jsxRuntime from 'react/jsx-runtime';

/**
 * Teto global de escala de fonte para textos gerais e inputs:
 * - No celular com fonte Padrão/Pequena (1.0x ou menor): mantém 100% original.
 * - No celular com fonte Média/Grande/Extra-Grande (1.3x a 2.0x): permite crescer
 *   até +12% (1.12x) para dar conforto visual sem quebrar cards, listas ou modais.
 */
export const GLOBAL_MAX_FONT_SIZE_MULTIPLIER = 1.12;

/**
 * Teto estrito para componentes compactos de interface (botões, badges, chips,
 * cabeçalhos e células de calendário), combinado com adjustsFontSizeToFit.
 */
export const COMPACT_UI_MAX_FONT_SIZE_MULTIPLIER = 1.05;

let isConfigured = false;

export function withDefaultFontScaleProps<P extends Record<string, unknown>>(
  type: unknown,
  props: P | null | undefined,
): P | null | undefined {
  if ((type === Text || type === TextInput) && props && typeof props === 'object') {
    if (props.maxFontSizeMultiplier === undefined) {
      return {
        ...props,
        maxFontSizeMultiplier: GLOBAL_MAX_FONT_SIZE_MULTIPLIER,
      };
    }
  }
  return props;
}

type JsxFactoryFn = (
  type: unknown,
  props: Record<string, unknown> | null | undefined,
  ...rest: unknown[]
) => unknown;

function wrapJsxModule(runtimeObj: Record<string, unknown>, methodName: string): void {
  const original = runtimeObj[methodName];
  if (typeof original !== 'function') {
    return;
  }

  const originalFn = original as JsxFactoryFn;
  try {
    runtimeObj[methodName] = function patchedJsx(
      type: unknown,
      props: Record<string, unknown> | null | undefined,
      ...rest: unknown[]
    ): unknown {
      return originalFn.call(
        this,
        type,
        withDefaultFontScaleProps(type, props),
        ...rest,
      );
    };
  } catch {
    // Caso o ambiente congele o módulo, ignora silenciosamente
  }
}

export function configureTypographyScaling(): void {
  if (isConfigured) {
    return;
  }
  isConfigured = true;

  wrapJsxModule(jsxRuntime as unknown as Record<string, unknown>, 'jsx');
  wrapJsxModule(jsxRuntime as unknown as Record<string, unknown>, 'jsxs');
  wrapJsxModule(jsxDevRuntime as unknown as Record<string, unknown>, 'jsxDEV');

  const originalCreateElement = React.createElement;
  try {
    React.createElement = function patchedCreateElement(
      type: unknown,
      props: Record<string, unknown> | null | undefined,
      ...children: unknown[]
    ) {
      return (originalCreateElement as (...args: unknown[]) => React.ReactElement)(
        type,
        withDefaultFontScaleProps(type, props),
        ...children,
      );
    } as typeof React.createElement;
  } catch {
    // Ignora caso React.createElement seja somente leitura
  }
}
