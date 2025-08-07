// In components/PlaceholderPage.tsx
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

const PlaceholderPage = ({ title, description }: { title: string; description?: string }) => {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 text-center px-4">
      <h1 className="text-5xl font-bold text-gray-800">{title}</h1>
      <p className="mt-4 text-xl text-gray-600 max-w-xl">
        {description || "This is a placeholder page. In a real application, this would contain the full feature and content."}
      </p>
      <div className="mt-8">
        <Button asChild>
          <Link href="/">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Go Back Home
          </Link>
        </Button>
      </div>
    </div>
  );
};

export default PlaceholderPage;