'use client'

import React, { useState, useMemo } from 'react'
import { Check, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { iconMapData, iconTags } from '@/data/icons'

interface IconPickerProps {
    value: string
    onChange: (iconName: string) => void
    label?: string
}

export default function IconPicker({ value, onChange, label = 'Select Icon' }: IconPickerProps) {
    const [open, setOpen] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')

    const filteredIcons = useMemo(() => {
        const query = searchQuery.toLowerCase().trim()
        if (!query) return Object.keys(iconMapData)

        return Object.keys(iconMapData).filter((key) => {
            // Check exact name match
            if (key.toLowerCase().includes(query)) return true

            // Check tags
            const tags = iconTags[key]
            if (tags && tags.some(tag => tag.toLowerCase().includes(query))) return true

            return false
        })
    }, [searchQuery])

    const SelectedIcon = value && iconMapData[value as keyof typeof iconMapData]
        ? iconMapData[value as keyof typeof iconMapData]
        : null

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-between px-3 font-normal"
                >
                    <span className="flex items-center gap-2">
                        {SelectedIcon ? (
                            <>
                                <SelectedIcon className="h-4 w-4" />
                                <span>{value}</span>
                            </>
                        ) : (
                            <span className="text-muted-foreground">{label}</span>
                        )}
                    </span>
                    <Search className="h-4 w-4 opacity-50" />
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col p-0 gap-0">
                <DialogHeader className="p-4 border-b">
                    <DialogTitle>Pick an Icon</DialogTitle>
                    <div className="relative mt-2">
                        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search icons (e.g. 'home', 'plumbing', 'garden')..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-8"
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery('')}
                                className="absolute right-2 top-2.5 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                            >
                                <X className="h-4 w-4" />
                                <span className="sr-only">Clear</span>
                            </button>
                        )}
                    </div>
                </DialogHeader>
                <ScrollArea className="flex-1 p-4">
                    <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
                        {filteredIcons.map((iconName) => {
                            const Icon = iconMapData[iconName as keyof typeof iconMapData]
                            const isSelected = value === iconName

                            if (!Icon) return null

                            return (
                                <Button
                                    key={iconName}
                                    variant={isSelected ? "default" : "outline"}
                                    className={cn(
                                        "relative flex flex-col items-center justify-center p-2 h-20 w-full gap-2 hover:bg-muted/80",
                                        isSelected && "border-primary bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary"
                                    )}
                                    onClick={() => {
                                        onChange(iconName)
                                        setOpen(false)
                                    }}
                                >
                                    <Icon className="h-6 w-6 shrink-0" />
                                    <span className="text-[10px] w-full truncate text-center leading-tight">{iconName}</span>
                                    {isSelected && (
                                        <div className="absolute top-1 right-1">
                                            <Check className="h-3 w-3 text-primary" />
                                        </div>
                                    )}
                                </Button>
                            )
                        })}

                        {filteredIcons.length === 0 && (
                            <div className="col-span-full py-12 text-center text-muted-foreground">
                                <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                <p>No icons found for "{searchQuery}"</p>
                            </div>
                        )}
                    </div>
                </ScrollArea>
                <div className="p-4 border-t bg-muted/50 text-xs text-muted-foreground text-center">
                    Showing {filteredIcons.length} icons
                </div>
            </DialogContent>
        </Dialog>
    )
}
