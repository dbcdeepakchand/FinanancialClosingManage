import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

export default function SearchableSelect({
  label, ariaLabel, options, value, onChange, placeholder, disabled = false
}) {
  const controlRef = useRef(null);
  const listboxId = useId();
  const selectedOption = options.find(option => option.value === value);
  const selectedLabel = selectedOption?.label || '';
  const [query, setQuery] = useState(selectedLabel);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    setQuery(selectedLabel);
  }, [selectedLabel]);

  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = event => {
      if (!controlRef.current?.contains(event.target)) {
        setOpen(false);
        setQuery(selectedLabel);
        setActiveIndex(-1);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [open, selectedLabel]);

  const filteredOptions = useMemo(() => {
    const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return options.filter(option => {
      const searchableText = `${option.label} ${option.detail || ''} ${option.searchText || ''}`
        .toLocaleLowerCase();
      return terms.every(term => searchableText.includes(term));
    });
  }, [options, query]);

  const chooseOption = option => {
    onChange(option.value);
    setQuery(option.label);
    setOpen(false);
    setActiveIndex(-1);
  };

  const handleKeyDown = event => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!open) {
        setQuery('');
        setOpen(true);
        setActiveIndex(0);
        return;
      }
      setOpen(true);
      setActiveIndex(index => Math.min(index + 1, filteredOptions.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        setQuery('');
        setOpen(true);
        setActiveIndex(options.length - 1);
        return;
      }
      setOpen(true);
      setActiveIndex(index => index < 0
        ? filteredOptions.length - 1
        : Math.max(index - 1, 0));
    } else if (event.key === 'Enter' && open && filteredOptions.length) {
      event.preventDefault();
      chooseOption(filteredOptions[activeIndex < 0 ? 0 : activeIndex]);
    } else if (event.key === 'Escape' && open) {
      event.preventDefault();
      setOpen(false);
      setQuery(selectedLabel);
      setActiveIndex(-1);
    }
  };

  return <div className="period-select searchable-select" ref={controlRef}>
    <span className="searchable-select-label">{label}</span>
    <div className="searchable-select-control">
      <input
        type="text"
        role="combobox"
        aria-label={ariaLabel}
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-activedescendant={open && activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined}
        autoComplete="off"
        disabled={disabled}
        placeholder={placeholder}
        value={query}
        onFocus={event => {
          setQuery('');
          setOpen(true);
          setActiveIndex(-1);
        }}
        onChange={event => {
          setQuery(event.target.value);
          setOpen(true);
          setActiveIndex(-1);
        }}
        onKeyDown={handleKeyDown}
        onBlur={event => {
          if (!controlRef.current?.contains(event.relatedTarget)) {
            setOpen(false);
            setQuery(selectedLabel);
            setActiveIndex(-1);
          }
        }}
      />
      <button
        type="button"
        className="searchable-select-toggle"
        aria-label={`Show ${ariaLabel.toLowerCase()} options`}
        aria-expanded={open}
        disabled={disabled}
        onMouseDown={event => event.preventDefault()}
        onClick={() => {
          setActiveIndex(-1);
          if (open) {
            setOpen(false);
            setQuery(selectedLabel);
          } else {
            setQuery('');
            setOpen(true);
          }
        }}
      ><ChevronDown size={13}/></button>
      {open && !disabled && <div className="searchable-select-options" id={listboxId} role="listbox" aria-label={`${ariaLabel} options`}>
        {filteredOptions.length === 0
          ? <div className="searchable-select-empty">No matching {ariaLabel.toLowerCase()}s</div>
          : filteredOptions.map((option, index) => <button
            type="button"
            className={`searchable-select-option ${index === activeIndex ? 'active' : ''}`}
            id={`${listboxId}-${index}`}
            role="option"
            aria-selected={option.value === value}
            key={option.value}
            onMouseDown={event => event.preventDefault()}
            onMouseEnter={() => setActiveIndex(index)}
            onClick={() => chooseOption(option)}
          ><span>{option.label}</span>{option.detail && <small>{option.detail}</small>}</button>)}
      </div>}
    </div>
  </div>;
}
