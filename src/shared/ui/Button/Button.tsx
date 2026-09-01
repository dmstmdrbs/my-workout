import {
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react'
import './Button.css'

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost'
export type ButtonSize = 'small' | 'medium'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  isLoading?: boolean
}

export function Button({
  variant = 'primary',
  size = 'medium',
  isLoading = false,
  disabled,
  className,
  children,
  type = 'button',
  ...props
}: ButtonProps) {
  const classes = [
    'ui-button',
    `ui-button--${variant}`,
    `ui-button--${size}`,
    className,
  ].filter(Boolean).join(' ')

  return (
    <button
      {...props}
      className={classes}
      type={type}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
    >
      {children}
    </button>
  )
}

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label' | 'children'> {
  'aria-label': string
  children: ReactNode
  size?: ButtonSize
}

export function IconButton({
  size = 'medium',
  className,
  children,
  type = 'button',
  ...props
}: IconButtonProps) {
  const classes = ['ui-icon-button', `ui-icon-button--${size}`, className]
    .filter(Boolean)
    .join(' ')

  return (
    <button {...props} className={classes} type={type}>
      {children}
    </button>
  )
}
