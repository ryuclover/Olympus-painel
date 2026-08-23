import argparse
import csv
import sys
from .core import scrape_google_maps

def main():
    parser = argparse.ArgumentParser(description="Google Maps Scraper CLI")
    parser.add_argument("-q", "--query", required=True, help="Search query")
    parser.add_argument("-o", "--output", required=True, help="Output CSV file path")
    parser.add_argument("-m", "--max-leads", type=int, default=30, help="Max leads to scrape")
    args = parser.parse_args()
    
    print(f"Starting search for: '{args.query}'")
    leads = scrape_google_maps(args.query, args.max_leads)
    
    if not leads:
        print("No leads found or error occurred.")
        sys.exit(0)
        
    fieldnames = ['Title','Address','Phone','Website','Url','Rating','Reviews','Category']
    try:
        with open(args.output, 'w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(leads)
        print(f"Successfully saved {len(leads)} leads to {args.output}")
    except Exception as e:
        print(f"Error saving to CSV: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
