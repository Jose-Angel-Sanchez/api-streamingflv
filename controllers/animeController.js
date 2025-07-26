"use client"

import { useState } from "react"
import { Filter, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { getAllGenres } from "@/lib/data"

interface GenreFilterProps {
  selectedGenres: string[]
  onGenreChange: (genres: string[]) => void
  className?: string
}

const allowedGenres = [
  "Acción", "Artes Marciales", "Aventuras", "Carreras", "Ciencia Ficción", "Comedia", "Demencia", "Demonios", "Deportes", "Drama", "Ecchi", "Escolares", "Espacial", "Fantasía", "Harem", "Historico", "Infantil", "Josei", "Juegos", "Magia", "Mecha", "Militar", "Misterio", "Música", "Parodia", "Policía", "Psicológico", "Recuentos de la vida", "Romance", "Samurai", "Seinen", "Shoujo", "Shounen", "Sobrenatural", "Superpoderes", "Suspenso", "Terror", "Vampiros", "Yaoi", "Yuri"
];

export default function GenreFilter({ selectedGenres, onGenreChange, className }: GenreFilterProps) {
  const [isOpen, setIsOpen] = useState(false)
  // Reemplazar la obtención de géneros por la lista permitida
  const allGenres = allowedGenres

  const handleGenreToggle = (genre: string) => {
    const newGenres = selectedGenres.includes(genre)
      ? selectedGenres.filter((g) => g !== genre)
      : [...selectedGenres, genre]
    onGenreChange(newGenres)
  }

  const clearAllFilters = () => {
    onGenreChange([])
  }

  return (
    <div className={className}>
      {/* Mobile Filter Button */}
      <div className="md:hidden mb-4">
        <Button
          variant="outline"
          onClick={() => setIsOpen(!isOpen)}
          className="w-full bg-gray-800 border-gray-700 text-white hover:bg-gray-700"
        >
          <Filter className="w-4 h-4 mr-2" />
          Filters {selectedGenres.length > 0 && `(${selectedGenres.length})`}
        </Button>
      </div>

      {/* Filter Panel */}
      <Card className={`bg-gray-800 border-gray-700 ${isOpen ? "block" : "hidden md:block"}`}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-white text-lg">Filter by Genre</CardTitle>
            {selectedGenres.length > 0 && (
              <Button variant="ghost" size="sm" onClick={clearAllFilters} className="text-gray-400 hover:text-white">
                Clear All
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Selected Genres */}
          {selectedGenres.length > 0 && (
            <div className="flex flex-wrap gap-2 pb-3 border-b border-gray-700">
              {selectedGenres.map((genre) => (
                <Badge
                  key={genre}
                  variant="secondary"
                  className="bg-purple-600/20 text-purple-300 border-purple-600/30 cursor-pointer hover:bg-purple-600/30"
                  onClick={() => handleGenreToggle(genre)}
                >
                  {genre}
                  <X className="w-3 h-3 ml-1" />
                </Badge>
              ))}
            </div>
          )}

          {/* Genre Checkboxes */}
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {allGenres.map((genre) => (
              <div key={genre} className="flex items-center space-x-2">
                <Checkbox
                  id={genre}
                  checked={selectedGenres.includes(genre)}
                  onCheckedChange={() => handleGenreToggle(genre)}
                  className="border-gray-600 data-[state=checked]:bg-purple-600 data-[state=checked]:border-purple-600"
                />
                <label htmlFor={genre} className="text-gray-300 hover:text-white cursor-pointer flex-1">
                  {genre}
                </label>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
