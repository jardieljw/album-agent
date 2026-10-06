import React from 'react';

export type IconBadgeVariant = 'gold' | 'neon' | 'cyan' | 'emerald' | 'sapphire' | 'rose';
export type IconBadgeSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export type IconBadgeShape = 'squircle' | 'circle';

interface IconBadgeProps {
  variant: IconBadgeVariant;
  children?: React.ReactNode;
  icon?: React.ReactNode;
  size?: IconBadgeSize;
  shape?: IconBadgeShape;
  className?: string;
  glow?: boolean;
}

export const IconBadge: React.FC<IconBadgeProps> = ({
  variant,
  children,
  icon,
  size = 'sm',
  shape = 'squircle',
  className = '',
  glow = true
}) => {
  const sizeClasses: Record<IconBadgeSize, string> = {
    xs: 'w-5 h-5 p-0.5 text-[10px]',
    sm: 'w-6 h-6 p-1 text-xs',
    md: 'w-8 h-8 p-1.5 text-sm',
    lg: 'w-10 h-10 p-2 text-base',
    xl: 'w-12 h-12 p-2.5 text-lg'
  };

  const shapeClasses: Record<IconBadgeShape, Record<IconBadgeSize, string>> = {
    squircle: {
      xs: 'rounded-md',
      sm: 'rounded-lg',
      md: 'rounded-xl',
      lg: 'rounded-2xl',
      xl: 'rounded-2xl'
    },
    circle: {
      xs: 'rounded-full',
      sm: 'rounded-full',
      md: 'rounded-full',
      lg: 'rounded-full',
      xl: 'rounded-full'
    }
  };

  const isExplicitCircle = className.includes('rounded-full') || shape === 'circle';
  const effectiveRadius = isExplicitCircle ? 'rounded-full' : shapeClasses[shape][size];

  const variantStyles: Record<IconBadgeVariant, string> = {
    gold: `bg-gradient-to-br from-amber-300 via-amber-500 to-amber-600 text-slate-950 border border-amber-300/40 ${
      glow ? 'shadow-md shadow-amber-500/25' : ''
    }`,
    neon: `bg-gradient-to-br from-violet-500 via-purple-500 to-pink-500 text-white border border-purple-400/30 ${
      glow ? 'shadow-md shadow-purple-500/30' : ''
    }`,
    cyan: `bg-gradient-to-br from-cyan-300 via-sky-500 to-blue-600 text-slate-950 border border-cyan-300/40 ${
      glow ? 'shadow-md shadow-cyan-500/25' : ''
    }`,
    emerald: `bg-gradient-to-br from-emerald-300 via-teal-500 to-emerald-600 text-slate-950 border border-emerald-300/40 ${
      glow ? 'shadow-md shadow-emerald-500/25' : ''
    }`,
    sapphire: `bg-gradient-to-br from-blue-400 via-indigo-500 to-blue-700 text-white border border-blue-400/30 ${
      glow ? 'shadow-md shadow-blue-500/30' : ''
    }`,
    rose: `bg-gradient-to-br from-rose-400 via-pink-600 to-red-600 text-white border border-rose-400/30 ${
      glow ? 'shadow-md shadow-rose-500/30' : ''
    }`
  };

  return (
    <div
      className={`relative inline-flex items-center justify-center aspect-square font-bold shrink-0 overflow-hidden select-none transition-transform duration-200 hover:scale-105 box-border ${effectiveRadius} ${sizeClasses[size]} ${variantStyles[variant]} ${className}`}
    >
      <div className="relative z-10 flex items-center justify-center w-full h-full [&>svg]:max-w-full [&>svg]:max-h-full">
        {icon ?? children}
      </div>
    </div>
  );
};

export default IconBadge;
