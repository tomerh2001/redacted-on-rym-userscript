import assert from 'node:assert/strict';
import test from 'node:test';

import { extractChartEntries, isChartsPath } from '../src/charts.js';

function createAnchor({
  href,
  textContent = '',
  className = '',
  parentTagName = 'DIV',
  parentClassName = '',
  attributeHref = href,
}) {
  const parentElement = {
    tagName: parentTagName,
    className: parentClassName,
  };

  return {
    href,
    textContent,
    className,
    parentElement,
    getAttribute(name) {
      if (name === 'href') {
        return attributeHref;
      }

      return null;
    },
  };
}

test('isChartsPath only matches Rate Your Music chart paths', () => {
  assert.equal(isChartsPath('/charts/esoteric/album,ep,single/2020s/'), true);
  assert.equal(isChartsPath('/release/album/james-blake/trying-times/'), false);
});

test('extractChartEntries skips non-chart pages entirely', () => {
  const doc = {
    querySelectorAll() {
      return [
        createAnchor({
          href: 'https://rateyourmusic.com/release/album/james-blake/trying-times/',
          textContent: 'Trying Times',
        }),
      ];
    },
  };

  assert.deepEqual(extractChartEntries(doc, { pathname: '/release/album/james-blake/trying-times/' }), []);
});

test('extractChartEntries keeps one entry per chart result and prefers the title link', () => {
  const chartPath = '/charts/esoteric/album,ep,single/2020s/';
  const doc = {
    querySelectorAll() {
      return [
        createAnchor({
          href: 'https://rateyourmusic.com/release/album/james-blake/trying-times/',
          textContent: '',
          className: 'chart_cover_link',
          parentTagName: 'DIV',
          parentClassName: 'chart_cover',
        }),
        createAnchor({
          href: 'https://rateyourmusic.com/release/album/james-blake/trying-times/',
          textContent: 'Trying Times',
          className: 'chart_item_title',
          parentTagName: 'H2',
          parentClassName: 'chart_item_title',
        }),
        createAnchor({
          href: 'https://rateyourmusic.com/release/single/crocheted-doughnut-ring/two-little-ladies-azalea-and-rhododendron-nice/',
          textContent: 'Two Little Ladies / Azalea and Rhododendron / Nice',
          className: 'chart_item_title',
          parentTagName: 'H2',
          parentClassName: 'chart_item_title',
        }),
        createAnchor({
          href: 'https://rateyourmusic.com/list/example',
          textContent: 'A list link that should be ignored',
          parentTagName: 'DIV',
        }),
      ];
    },
  };

  const entries = extractChartEntries(doc, { pathname: chartPath });
  assert.equal(entries.length, 2);

  const albumEntry = entries.find(entry => entry.metadata.releaseKind === 'album');
  assert.equal(albumEntry?.metadata.artist, 'James Blake');
  assert.equal(albumEntry?.metadata.title, 'Trying Times');
  assert.equal(albumEntry?.href, 'https://rateyourmusic.com/release/album/james-blake/trying-times/');
  assert.equal(albumEntry?.anchor.textContent, 'Trying Times');

  const singleEntry = entries.find(entry => entry.metadata.releaseKind === 'single');
  assert.equal(singleEntry?.metadata.artist, 'Crocheted Doughnut Ring');
  assert.equal(singleEntry?.metadata.title, 'Two Little Ladies / Azalea and Rhododendron / Nice');
});

test('extractChartEntries supports EP chart results and relative hrefs', () => {
  const doc = {
    querySelectorAll() {
      return [
        createAnchor({
          href: 'https://rateyourmusic.com/release/ep/air/moon-safari/',
          attributeHref: '/release/ep/air/moon-safari/',
          textContent: 'Moon Safari',
          className: 'chart_item_title',
          parentTagName: 'H3',
          parentClassName: 'chart_item_title',
        }),
      ];
    },
  };

  const entries = extractChartEntries(doc, { pathname: '/charts/esoteric/album,ep,single/2020s/' });
  assert.equal(entries.length, 1);
  assert.deepEqual(entries[0].metadata, {
    pageKind: 'release',
    releaseKind: 'ep',
    artist: 'Air',
    title: 'Moon Safari',
    year: null,
  });
});
