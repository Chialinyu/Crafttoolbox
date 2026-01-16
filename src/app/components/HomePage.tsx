import React, { useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { Search, Sparkles, Wrench } from 'lucide-react';
import { Input } from './ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { motion } from 'motion/react';
import { trackToolUsage } from '@/utils/analytics';
import mosaicCoverImage from 'figma:asset/4c8c8c444f1a5c2f669857a0cf97d9b4e297969c.png';
import vectorizerCoverImage from 'figma:asset/26dbf5422d730b30c7e811c79eb16feb1ffe0331.png';

interface Tool {
  id: string;
  nameKey: string;
  descKey: string;
  category: string;
  icon?: string;
  imageUrl?: string;
  gradient: string;
}

const tools: Tool[] = [
  {
    id: 'mosaic-generator',
    nameKey: 'mosaicGenerator',
    descKey: 'mosaicGeneratorDesc',
    category: 'collageArt',
    imageUrl: mosaicCoverImage,
    gradient: 'from-primary/20 to-accent/20',
  },
  {
    id: 'vectorizer-tool',
    nameKey: 'vectorizerTool',
    descKey: 'vectorizerToolDesc',
    category: 'collageArt',
    imageUrl: vectorizerCoverImage,
    gradient: 'from-accent/20 to-secondary/20',
  },
  // Add more tools here in the future
];

interface HomePageProps {
  onSelectTool: (toolId: string) => void;
}

export const HomePage: React.FC<HomePageProps> = ({ onSelectTool }) => {
  const { t } = useLanguage();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const categories = [
    { key: 'all', labelKey: 'allCategories' },
    { key: 'collageArt', labelKey: 'collageArt' },
    { key: 'textile', labelKey: 'textile' },
    { key: 'paperCraft', labelKey: 'paperCraft' },
    { key: 'painting', labelKey: 'painting' },
  ];

  const filteredTools = tools.filter(tool => {
    const matchesSearch = t(tool.nameKey).toLowerCase().includes(searchQuery.toLowerCase()) ||
                          t(tool.descKey).toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || tool.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="py-12 sm:py-20 px-4 sm:px-6 lg:px-8">
        <div className="container mx-auto max-w-4xl text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="flex justify-center mb-6">
              <div className="p-4 rounded-full bg-primary/10">
                <Sparkles className="h-12 w-12 text-primary" />
              </div>
            </div>
            <h2 className="text-3xl sm:text-5xl mb-4 select-none">{t('welcomeTitle')}</h2>
            <p className="text-lg sm:text-xl text-muted-foreground mb-8 select-none">
              {t('welcomeSubtitle')}
            </p>
          </motion.div>

          {/* Search Bar */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="relative max-w-xl mx-auto mb-8"
          >
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              type="text"
              placeholder={t('searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-12 rounded-full bg-card shadow-sm"
            />
          </motion.div>

          {/* Category Filter */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="flex flex-wrap justify-center gap-2 mb-12"
          >
            {categories.map((category) => (
              <button
                key={category.key}
                onClick={() => setSelectedCategory(category.key)}
                className={`px-4 py-2 rounded-full transition-all select-none ${
                  selectedCategory === category.key
                    ? 'bg-primary text-primary-foreground shadow-md'
                    : 'bg-card hover:bg-muted'
                }`}
              >
                {t(category.labelKey)}
              </button>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Tools Grid */}
      <section className="px-4 sm:px-6 lg:px-8 pb-20">
        <div className="container mx-auto max-w-6xl">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredTools.map((tool, index) => (
              <motion.div
                key={tool.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: index * 0.1 }}
              >
                <Card
                  className="cursor-pointer hover:shadow-lg transition-all duration-300 hover:-translate-y-1 overflow-hidden group"
                  onClick={() => {
                    trackToolUsage(tool.id, 'tool_selected', t(tool.nameKey));
                    onSelectTool(tool.id);
                  }}
                >
                  {tool.imageUrl ? (
                    <div className="h-48 overflow-hidden relative">
                      <img 
                        src={tool.imageUrl} 
                        alt={t(tool.nameKey)}
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                      />
                    </div>
                  ) : (
                    <div className={`h-32 bg-gradient-to-br ${tool.gradient} flex items-center justify-center`}>
                      <span className="text-6xl group-hover:scale-110 transition-transform duration-300">
                        {tool.icon}
                      </span>
                    </div>
                  )}
                  <CardHeader>
                    <CardTitle>{t(tool.nameKey)}</CardTitle>
                    <CardDescription className="text-sm">
                      {t(tool.descKey)}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-xs text-muted-foreground select-none">
                      {t(tool.category)}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          {filteredTools.length === 0 && (
            <div className="text-center py-12">
              <p className="text-muted-foreground">
                {searchQuery ? '沒有找到相關工具 / No tools found' : ''}
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

HomePage.displayName = 'HomePage';