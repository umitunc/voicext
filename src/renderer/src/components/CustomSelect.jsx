import React, { Fragment } from 'react'
import { Listbox, Transition } from '@headlessui/react'
import { Check, ChevronDown } from 'lucide-react'

export default function CustomSelect({ value, onChange, options, label }) {
  const selectedOption = options.find(opt => opt.id === value) || options[0]

  return (
    <div className="input-group">
      {label && <label>{label}</label>}
      <Listbox value={value} onChange={onChange}>
        <div className="relative mt-1">
          <Listbox.Button className="select-custom text-left w-full">
            <span className="block truncate">{selectedOption.name}</span>
            <ChevronDown className="h-4 w-4 text-muted pointer-events-none" aria-hidden="true" />
          </Listbox.Button>
          <Transition
            as={Fragment}
            leave="transition ease-in duration-100"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <Listbox.Options className="absolute z-50 mt-1 max-height-60 w-full overflow-auto bg-dark-glass py-1 focus:outline-none shadow-lg">
              {options.map((option) => (
                <Listbox.Option
                  key={option.id}
                  className={({ active }) =>
                    `relative cursor-default select-none py-2 pl-10 pr-4 ${
                      active ? 'bg-white/10 text-primary-cyan' : 'text-white'
                    }`
                  }
                  value={option.id}
                >
                  {({ selected }) => (
                    <>
                      <span className={`block truncate ${selected ? 'font-medium' : 'font-normal'}`}>
                        {option.name}
                      </span>
                      {selected ? (
                        <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-primary-cyan">
                          <Check className="h-4 w-4" aria-hidden="true" />
                        </span>
                      ) : null}
                    </>
                  )}
                </Listbox.Option>
              ))}
            </Listbox.Options>
          </Transition>
        </div>
      </Listbox>
    </div>
  )
}
