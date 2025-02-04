import React, { forwardRef, useContext, useImperativeHandle } from 'react'
import { NativeProps, withNativeProps } from '../utils/native-props'
import classNames from 'classnames'
import { CheckboxGroupContext } from './group-context'
import { usePropsValue } from '../utils/use-props-value'
import { mergeProps } from '../utils/with-default-props'
import { CheckIcon } from './check-icon'
import { IndeterminateIcon } from './indeterminate-icon'
import { NativeInput } from './native-input'

const classPrefix = `adm-checkbox`

export type CheckboxValue = string | number

export type CheckboxProps = {
  checked?: boolean
  defaultChecked?: boolean
  disabled?: boolean
  onChange?: (checked: boolean) => void
  value?: CheckboxValue
  indeterminate?: boolean
  block?: boolean
  id?: string
  icon?: (checked: boolean, indeterminate: boolean) => React.ReactNode
  children?: React.ReactNode
  onClick?: (event: React.MouseEvent<HTMLLabelElement, MouseEvent>) => void
} & NativeProps<'--icon-size' | '--font-size' | '--gap'>

const defaultProps = {
  defaultChecked: false,
  indeterminate: false,
}

export type CheckboxRef = {
  check: () => void
  uncheck: () => void
  toggle: () => void
}

export const Checkbox = forwardRef<CheckboxRef, CheckboxProps>((p, ref) => {
  const groupContext = useContext(CheckboxGroupContext)

  const props = mergeProps(defaultProps, p)

  let [checked, setChecked] = usePropsValue({
    value: props.checked,
    defaultValue: props.defaultChecked,
    onChange: props.onChange,
  }) as [boolean, (v: boolean) => void]
  let disabled = props.disabled

  const { value } = props
  if (groupContext && value !== undefined) {

    checked = groupContext.value.includes(value)
    setChecked = (checked: boolean) => {
      if (checked) {
        groupContext.check(value)
      } else {
        groupContext.uncheck(value)
      }
      props.onChange?.(checked)
    }
    disabled = disabled || groupContext.disabled
  }

  useImperativeHandle(ref, () => ({
    check: () => {
      setChecked(true)
    },
    uncheck: () => {
      setChecked(false)
    },
    toggle: () => {
      setChecked(!checked)
    },
  }))

  const renderIcon = () => {
    if (props.icon) {
      return (
        <div className={`${classPrefix}-custom-icon`}>
          {props.icon(checked, props.indeterminate)}
        </div>
      )
    }

    return (
      <div className={`${classPrefix}-icon`}>
        {props.indeterminate ? <IndeterminateIcon /> : checked && <CheckIcon />}
      </div>
    )
  }

  return withNativeProps(
    props,
    <label
      onClick={props.onClick}
      className={classNames(classPrefix, {
        [`${classPrefix}-checked`]: checked && !props.indeterminate,
        [`${classPrefix}-indeterminate`]: props.indeterminate,
        [`${classPrefix}-disabled`]: disabled,
        [`${classPrefix}-block`]: props.block,
      })}
    >
      <NativeInput
        type='checkbox'
        checked={checked}
        onChange={setChecked}
        disabled={disabled}
        id={props.id}
      />
      {renderIcon()}
      {props.children && (
        <div className={`${classPrefix}-content`}>{props.children}</div>
      )}
    </label>
  )
})
